// lib/constructs/platform/eks/cluster.ts

import * as eks from 'aws-cdk-lib/aws-eks';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';

//---------------------------------------------------
// Kubernetes version specific
import { KubectlV33Layer } from '@aws-cdk/lambda-layer-kubectl-v33';
const Kubernetes_Version_Str = '1.33';
const MyKubectlLayerClass = KubectlV33Layer;
const My_Kubectl_Layer_Str = "KubectlV33Layer"
//---------------------------------------------------

// requires:
// app> npm install @aws-cdk/lambda-layer-kubectl-v33

export class K8sClusterConstruct extends Construct {
  public readonly cluster: eks.Cluster;
  public readonly nodeGroupAsg: autoscaling.AutoScalingGroup;

  constructor(scope: Construct, id: string, vpc: ec2.IVpc) {
    super(scope, id);

    const kubectlLayer = new MyKubectlLayerClass(this, My_Kubectl_Layer_Str);

    this.cluster = new eks.Cluster(this, 'Cluster', {
      vpc,
      version: eks.KubernetesVersion.of(Kubernetes_Version_Str),
      defaultCapacity: 0, // Set to 0 as we'll add capacity explicitly below
      kubectlLayer,
    });

    // --- Create AutoScalingGroup separately, then connect to EKS ---
    this.nodeGroupAsg = new autoscaling.AutoScalingGroup(this, 'EKSNodeAutoScalingGroup', {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
      // This 'machineImage' property is correctly supported on autoscaling.AutoScalingGroup
    //   machineImage: eks.EksOptimizedImage.amazonLinux2023({
    //     kubernetesVersion: Kubernetes_Version_Str,
    //   }),
      minCapacity: 1,
      maxCapacity: 3,
      desiredCapacity: 2,
      // Ensure the ASG is in the private subnets for EKS worker nodes
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });

    // Connect this Auto Scaling Group to the EKS cluster
    //this.cluster.connectAutoScalingGroup(this.nodeGroupAsg);
  }
}