import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';
import { AppStackProps } from '../app-stack';

/**
 * Shared interfaces for compute platform abstraction.
 */
export interface ComputePlatformProps {
  vpc: ec2.IVpc;
  taskRole: iam.IRole;
  
  /** The ECS ContainerImage (used by ECS) */
  containerImage: ecs.ContainerImage;
  /** Docker image name (e.g. "repo/name:tag") for Kubernetes manifests */
  containerImageName: string;

  securityGroup: ec2.ISecurityGroup;
  listener: elbv2.ApplicationListener;
  serviceName: string;
  stagingEnvironment: 'dev' | 'release';
  appPortNum: number;
  healthChecks?: AppStackProps['healthChecks'];
}

export interface ComputePlatformOutputs {
  serviceEndpoint: string;
  targetGroups: elbv2.ITargetGroup[];
}

/**
 * A construct interface for abstracting compute deployments
 * (ECS, Kubernetes, etc.) behind a common contract.
 */
export interface IComputePlatform {
  deploy(props: ComputePlatformProps): ComputePlatformOutputs;
}
