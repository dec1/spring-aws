// lib/constructs/platform/eks/compute.ts

import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling'; // Still need this for ASG type and attachment
import {
  IComputePlatform,
  ComputePlatformProps,
  ComputePlatformOutputs,
} from '../../compute';
import { K8sClusterConstruct } from './cluster';
import { K8sWorkloadConstruct } from './workload';

export class K8sPlatform extends Construct implements IComputePlatform {
  private readonly k8sCluster: K8sClusterConstruct;

  constructor(scope: Construct, id: string, vpc: ec2.IVpc) {
    super(scope, id);
    // K8sClusterConstruct will create the cluster and the managed nodegroup
    this.k8sCluster = new K8sClusterConstruct(this, 'K8sCluster', vpc);
  }

  deploy(props: ComputePlatformProps): ComputePlatformOutputs {
    // Deploy Kubernetes workload (Deployment and NodePort Service)
    const workload = new K8sWorkloadConstruct(
      this,
      'Workload',
      this.k8sCluster.cluster,
      props
    );

    // Retrieve the Managed Nodegroup instance by its ID ('NodeGroup')
    // This allows us to access its underlying AutoScalingGroup
    const nodeGroup = this.k8sCluster.cluster.getNodeGroup('NodeGroup');

    // Ensure the node group and its ASG exist before creating the target group
    if (!nodeGroup) {
        console.error("ERROR: EKS Managed NodeGroup 'NodeGroup' not found. Check K8sClusterConstruct setup.");
        throw new Error("Failed to find EKS Managed NodeGroup for ALB Target Group registration.");
    }

    if (!nodeGroup.autoScalingGroup) { // <<< This property IS available on Nodegroup now in recent CDK versions
        console.error("ERROR: AutoScalingGroup not found for Managed NodeGroup 'NodeGroup'.");
        throw new Error("Failed to retrieve AutoScalingGroup from Managed NodeGroup for ALB Target Group registration.");
    }

    // Create Target Group pointing to worker nodes on NodePort
    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'TargetGroup', {
      vpc: props.vpc,
      port: 30080, // NodePort we defined in the Kubernetes service
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.INSTANCE, // Target the EC2 instances directly
      healthCheck: {
        path: '/actuator/health', // Spring Actuator health endpoint
        port: '30080', // Health check on NodePort
        healthyHttpCodes: '200',
      },
    });

    // Attach the Managed Node Group's Auto Scaling Group to the ALB Target Group
    // This method expects a concrete AutoScalingGroup class instance.
    // The 'autoScalingGroup' property on a Nodegroup is an IAutoScalingGroup,
    // but in practice with managed node groups, it behaves like an AutoScalingGroup for attachment.
    (nodeGroup.autoScalingGroup as autoscaling.AutoScalingGroup).attachToApplicationTargetGroup(targetGroup);
    console.log('Attached EKS Managed NodeGroup AutoScalingGroup to Target Group.');

    // Add to existing ALB listener - forward ALL traffic to K8s
    props.listener.addTargetGroups('K8sServiceRule', {
      targetGroups: [targetGroup],
      // No 'priority', no conditions = default listener action
    });

    return {
      serviceEndpoint: `${props.serviceName}-service`,
      targetGroups: [targetGroup],
    };
  }
}