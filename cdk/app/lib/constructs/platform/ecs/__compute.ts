import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { Construct } from 'constructs';
import {
  IComputePlatform,
  ComputePlatformProps,
  ComputePlatformOutputs,
} from '../../compute';
import { FargateServiceConstruct } from './service';

/**
 * ECS implementation of the ComputePlatform abstraction.
 */
export class EcsPlatform extends Construct implements IComputePlatform {
  private cluster: ecs.Cluster;

  constructor(scope: Construct, id: string, vpc: ec2.IVpc) {
    super(scope, id);
    this.cluster = new ecs.Cluster(this, 'Cluster', { vpc });
  }

  deploy(props: ComputePlatformProps): ComputePlatformOutputs {
    const service = new FargateServiceConstruct(this, 'Service', {
      cluster: this.cluster,
      taskRole: props.taskRole,
      containerImage: props.containerImage,
      fargateSg: props.securityGroup,
      listener: props.listener,
      vpc: props.vpc,
      serviceName: props.serviceName,
      stagingEnvironment: props.stagingEnvironment,
      healthChecks: props.healthChecks!,
      s3DataBucketName: '',
      awsRegion: '',
      terminationWaitTimeMinutes: undefined,
      appPortNum: props.appPortNum,
      imageSource: 'dockerhub',
      repositoryName: '',
      tag: '',
      wantGrafana: false,
    });

    return {
      serviceEndpoint: service.blueService.serviceName,
      targetGroups: [
        service.blueTargetGroup,
        ...(service.greenTargetGroup ? [service.greenTargetGroup] : []),
      ],
    };
  }
}
