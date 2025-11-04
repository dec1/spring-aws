// lib/constructs/platform/ecs/service.ts

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as codedeploy from 'aws-cdk-lib/aws-codedeploy';
import { Construct } from 'constructs';
import { AppStackProps } from '../../../app-stack';
import { ContainerImageProvisioner } from '../../image-provisioner';
import { GrafanaAlloySidecarConstruct } from './grafana/grafana';

/**
 * Properties for the FargateServiceConstruct.
 * This interface aggregates necessary configurations from the main AppStackProps
 * and references to other resources created in the stack.
 */
export interface FargateServiceConstructProps {
  cluster: ecs.ICluster;
  taskRole: iam.IRole;
  containerImage: ecs.ContainerImage;
  fargateSg: ec2.ISecurityGroup;
  listener: elbv2.ApplicationListener;
  vpc: ec2.IVpc;
  serviceName: string;
  stagingEnvironment: 'dev' | 'release';
  healthChecks: AppStackProps['healthChecks'];
  
  /** Environment variables to pass to the container */
  environment: Record<string, string>;
  
  terminationWaitTimeMinutes?: number;
  appPortNum: number;

  // === for green service image provisioning ===
  imageSource: 'ecr' | 'dockerhub';
  repositoryName: string;
  tag: string;

  wantGrafana?: boolean;
}

/**
 * A CDK Construct that provisions ECS Fargate services, including task definitions,
 * containers, auto-scaling, and CodeDeploy configuration for blue/green deployments if enabled.
 */
export class FargateServiceConstruct extends Construct {
  public readonly blueService: ecs.FargateService;
  public readonly greenService?: ecs.FargateService;
  public readonly blueTargetGroup: elbv2.ApplicationTargetGroup;
  public readonly greenTargetGroup?: elbv2.ApplicationTargetGroup;

  /**
   * Creates the Fargate services (blue and optionally green), task definitions,
   * target groups, auto-scaling, and CodeDeploy setup.
   * @param scope The parent CDK Stack or Construct.
   * @param id The logical ID of this construct.
   * @param props Configuration properties for the Fargate services.
   */
  constructor(scope: Construct, id: string, props: FargateServiceConstructProps) {
    super(scope, id);

    const enableBlueGreenDeployment = props.stagingEnvironment === 'release';

    // Common health check configuration for the container within the task definition
    const commonContainerHealthCheck: ecs.HealthCheck = {
      command: props.healthChecks.containerHealthCheckCommand,
      retries: props.healthChecks.containerHealthCheckRetries,
      startPeriod: props.healthChecks.containerHealthCheckStartPeriod,
      timeout: props.healthChecks.containerHealthCheckTimeout,
      interval: props.healthChecks.containerHealthCheckInterval,
    };

    // Common health check configuration for the target group (used by ALB)
    const commonTargetGroupHealthCheck: elbv2.HealthCheck = {
      interval: props.healthChecks.targetGroupHealthCheckInterval,
      timeout: props.healthChecks.targetGroupHealthCheckTimeout,
      path: props.healthChecks.targetGroupHealthCheckPath,
      healthyThresholdCount: props.healthChecks.targetGroupHealthyThresholdCount,
      protocol: elbv2.Protocol.HTTP,
    };

    // --- Blue Service (Production/Current) ---
    const blueTaskDefinition = new ecs.FargateTaskDefinition(this, 'BlueTaskDefinition', {
      cpu: 512,
      memoryLimitMiB: 1024,
      taskRole: props.taskRole,
      family: `${props.serviceName}-${props.stagingEnvironment}-blue-task`,
    });

    const blueAppContainer = blueTaskDefinition.addContainer('AppContainer', {
      image: props.containerImage,
      environment: props.environment,
      healthCheck: commonContainerHealthCheck,
      portMappings: [{ containerPort: props.appPortNum }],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: `${props.serviceName}-${props.stagingEnvironment}-blue-logs` }),
    });

    //-------------------------------------------------
    // --- Conditional Grafana Alloy sidecar deployment (blue service) ---
    if (props.wantGrafana) {
      const url  = process.env.GRAFANA_REMOTE_WRITE_URL;
      const user = process.env.GRAFANA_USERNAME;
      const key  = process.env.GRAFANA_API_KEY;

      if (!url || !user || !key) {
        throw new Error(
          '[GrafanaAlloySidecar] wantGrafana=true, but one or more of GRAFANA_REMOTE_WRITE_URL / GRAFANA_USERNAME / GRAFANA_API_KEY is missing.'
        );
      }

      new GrafanaAlloySidecarConstruct(this, 'BlueAlloySidecar', {
        taskDefinition: blueTaskDefinition,
        appContainer: blueAppContainer,
        stagingEnvironment: props.stagingEnvironment,
        serviceName: props.serviceName,
        grafanaCloudPrometheusRemoteWriteUrl: url,
        grafanaCloudPrometheusUsername: user,
        grafanaCloudPrometheusApiKey: key,
      });
      console.log(`[CDK] Grafana Alloy sidecar enabled for ${props.stagingEnvironment} Blue service.`);
    } else {
      console.log(`[CDK] wantGrafana=false → no Grafana Alloy sidecar for ${props.stagingEnvironment}.`);
    }

    //-------------------------------------------------

    /**
     * Creates the 'blue' Fargate service.
     */
    this.blueService = new ecs.FargateService(this, 'BlueService', {
      cluster: props.cluster,
      taskDefinition: blueTaskDefinition,
      desiredCount: 1,
      securityGroups: [props.fargateSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      healthCheckGracePeriod: cdk.Duration.seconds(300),
      deploymentController:
        enableBlueGreenDeployment
          ? { type: ecs.DeploymentControllerType.CODE_DEPLOY }
          : { type: ecs.DeploymentControllerType.ECS },
      serviceName: `${props.serviceName}-${props.stagingEnvironment}-blue-svc`,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
    });

    /**
     * Creates the Application Target Group for the 'blue' service.
     */
    this.blueTargetGroup = new elbv2.ApplicationTargetGroup(this, 'BlueTargetGroup', {
      vpc: props.vpc,
      port: props.appPortNum,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [this.blueService],
      healthCheck: commonTargetGroupHealthCheck,
      targetGroupName: `${props.serviceName}-${props.stagingEnvironment}-blue-tg`,
      targetType: elbv2.TargetType.IP,
    });

    // Configure auto-scaling...
    const blueScalableTarget = this.blueService.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: props.stagingEnvironment === 'dev' ? 2 : 10,
    });
    blueScalableTarget.scaleOnCpuUtilization('BlueCpuScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    // --- Green Service & CodeDeploy (if enabled) ---
    if (enableBlueGreenDeployment) {
      new cdk.CfnOutput(this, 'DeployedGreenImageTag', {
        value: props.tag,
        description: 'Green image tag (new release)',
      });

      const greenImageProvisioner = new ContainerImageProvisioner(this, 'GreenAppContainerImage', {
        imageSource: props.imageSource,
        repositoryName: props.repositoryName,
        tag: props.tag,
      });

      const greenTaskDefinition = new ecs.FargateTaskDefinition(this, 'GreenTaskDefinition', {
        cpu: 512,
        memoryLimitMiB: 1024,
        taskRole: props.taskRole,
        family: `${props.serviceName}-${props.stagingEnvironment}-green-task`,
      });

      greenTaskDefinition.addContainer('AppContainer', {
        image: greenImageProvisioner.containerImage,
        environment: props.environment,
        healthCheck: commonContainerHealthCheck,
        portMappings: [{ containerPort: props.appPortNum }],
        logging: ecs.LogDrivers.awsLogs({ streamPrefix: `${props.serviceName}-${props.stagingEnvironment}-green-logs` }),
      });

      /**
       * Creates the 'green' Fargate service for blue/green deployments.
       */
      this.greenService = new ecs.FargateService(this, 'GreenService', {
        cluster: props.cluster,
        taskDefinition: greenTaskDefinition,
        desiredCount: 0,
        securityGroups: [props.fargateSg],
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        healthCheckGracePeriod: cdk.Duration.seconds(300),
        deploymentController: { type: ecs.DeploymentControllerType.CODE_DEPLOY },
        serviceName: `${props.serviceName}-${props.stagingEnvironment}-green-svc`,
      });

      this.greenTargetGroup = new elbv2.ApplicationTargetGroup(this, 'GreenTargetGroup', {
        vpc: props.vpc,
        port: props.appPortNum,
        protocol: elbv2.ApplicationProtocol.HTTP,
        targets: [this.greenService],
        healthCheck: commonTargetGroupHealthCheck,
        targetGroupName: `${props.serviceName}-${props.stagingEnvironment}-green-tg`,
        targetType: elbv2.TargetType.IP,
      });
    }

    /**
     * Override the listener's default action rather than creating a new ListenerRule.
     */
    const cfnListener = props.listener.node.defaultChild as elbv2.CfnListener;
    if (!cfnListener) {
      throw new Error('CfnListener could not be obtained from props.listener. Ensure listener is not an imported L1 CfnListener.');
    }
    cfnListener.addPropertyOverride('DefaultActions', [
      enableBlueGreenDeployment
        ? {
          Type: 'forward',
          ForwardConfig: {
            TargetGroups: [
              { TargetGroupArn: this.blueTargetGroup.targetGroupArn, Weight: 100 },
              { TargetGroupArn: this.greenTargetGroup!.targetGroupArn, Weight: 0 },
            ],
          },
        }
        : {
          Type: 'forward',
          TargetGroupArn: this.blueTargetGroup.targetGroupArn,
        },
    ]);

    // --- ADD EXPLICIT DEPENDENCIES FOR ECS SERVICES ON LISTENER ---
    const cfnBlueService = this.blueService.node.defaultChild as ecs.CfnService;
    if (cfnBlueService) {
      cfnBlueService.addDependency(cfnListener);
    }
    if (enableBlueGreenDeployment) {
      const cfnGreenService = this.greenService!.node.defaultChild as ecs.CfnService;
      if (cfnGreenService) {
        cfnGreenService.addDependency(cfnListener);
      }
    }
    // --- END EXPLICIT DEPENDENCY ADDITION ---

    // --- CodeDeploy Blue/Green Deployment Group ---
    if (enableBlueGreenDeployment) {
      if (!this.greenTargetGroup) {
        throw new Error('GreenTargetGroup must be defined for blue/green deployments.');
      }
      new codedeploy.EcsDeploymentGroup(this, 'DeploymentGroup', {
        service: this.blueService,
        blueGreenDeploymentConfig: {
          blueTargetGroup: this.blueTargetGroup,
          greenTargetGroup: this.greenTargetGroup,
          listener: props.listener,
          terminationWaitTime: cdk.Duration.minutes(props.terminationWaitTimeMinutes ?? 5),
        },
        deploymentConfig: codedeploy.EcsDeploymentConfig.CANARY_10PERCENT_5MINUTES,
        autoRollback: {
          failedDeployment: true,
          stoppedDeployment: true,
          deploymentInAlarm: false,
        },
      });
    }
  }
}