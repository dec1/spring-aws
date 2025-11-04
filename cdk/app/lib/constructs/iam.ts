//  lib/constructs/iam.ts

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

/**
 * A CDK Construct that provisions an IAM Role for ECS Fargate tasks.
 * 
 * This role can:
 *   1) List ALL buckets in the account
 *   2) List the contents of any bucket
 *   3) Get, Put, and Delete objects in any bucket
 *   4) Call STS:GetCallerIdentity on itself
 */
export class IamConstruct extends Construct {
  public readonly taskRole: iam.Role;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // 1) Create the IAM Role assumed by ECS tasks
    this.taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'IAM role for ECS Fargate tasks to access AWS services like S3 and STS.',
    });

    // 2) STS: Allow the task to verify its own identity
    this.taskRole.addToPolicy(new iam.PolicyStatement({
      sid: 'AllowStsGetCallerIdentity',
      effect: iam.Effect.ALLOW,
      actions: ['sts:GetCallerIdentity'],
      resources: ['*'],
    }));

    // 3) S3: List ALL buckets in the account
    this.taskRole.addToPolicy(new iam.PolicyStatement({
      sid: 'AllowListAllBuckets',
      effect: iam.Effect.ALLOW,
      actions: ['s3:ListAllMyBuckets'],
      resources: ['*'],
    }));

    // 4) S3: List the contents of any bucket
    this.taskRole.addToPolicy(new iam.PolicyStatement({
      sid: 'AllowListAnyBucket',
      effect: iam.Effect.ALLOW,
      actions: ['s3:ListBucket'],
      resources: ['arn:aws:s3:::*'],
    }));

    // 5) S3: Get, Put, and Delete objects in any bucket
    this.taskRole.addToPolicy(new iam.PolicyStatement({
      sid: 'AllowObjectActionsAnyBucket',
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:DeleteObject',
      ],
      resources: ['arn:aws:s3:::*/*'],
    }));
  }
}
