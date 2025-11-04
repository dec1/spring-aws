// lib/constructs/storage.ts

import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

/**
 * Properties for the StorageConstruct
 */
export interface StorageConstructProps {
  /** Optional bucket name for the S3 bucket */
  bucketName?: string;
  /** Whether to create bucket if it doesn't exist (default: true) */
  createIfNecessary?: boolean;
}

/**
 * A CDK construct that creates or imports an S3 bucket for storing application data.
 * The bucket is configured with versioning, server-side encryption,
 * and blocks all public access by default.
 */
export class StorageConstruct extends Construct {
  public readonly dataBucket?: s3.IBucket;

  /**
   * Creates or imports an S3 bucket with the specified configuration.
   * @param scope The CDK Stack or Construct that this construct belongs to
   * @param id The logical ID of this construct
   * @param props Optional properties, including a custom bucket name
   */
  constructor(scope: Construct, id: string, props: StorageConstructProps = {}) {
    super(scope, id);

    if (!props.bucketName) {
      console.log('[Storage] No bucket configured');
      return;
    }

    const shouldCreate = props.createIfNecessary !== false;

    if (shouldCreate) {
      /**
       * Provisions an S3 bucket with the following configuration:
       * - bucketName: Uses the provided name or a default CDK-generated name
       * - encryption: Uses AWS-managed server-side encryption (SSE-S3)
       * - blockPublicAccess: Blocks all public access to the bucket and its objects
       * - versioned: Enables versioning to retain object versions
       */
      this.dataBucket = new s3.Bucket(this, 'DataBucket', {
        bucketName: props.bucketName,
        encryption: s3.BucketEncryption.S3_MANAGED,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        versioned: true,
        removalPolicy: cdk.RemovalPolicy.DESTROY, // Delete bucket on stack deletion
        autoDeleteObjects: true, // Delete objects on bucket deletion
      });
      console.log(`[Storage] Creating bucket: ${props.bucketName}`);
    } else {
      // Import existing bucket
      this.dataBucket = s3.Bucket.fromBucketName(this, 'DataBucket', props.bucketName);
      console.log(`[Storage] Importing existing bucket: ${props.bucketName}`);
    }
  }
}