import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { Construct } from 'constructs';

/**
 * Properties for the ContainerImageProvisioner
 */
export interface ContainerImageProvisionerProps {
  /** Source of the container image: either 'ecr' or 'dockerhub' */
  imageSource: 'ecr' | 'dockerhub';
  /** Name of the repository (for ECR or Docker Hub) */
  repositoryName: string;
  /** Tag of the container image */
  tag: string;
}

/**
 * A CDK construct that provisions a container image for use in ECS.
 * Supports images from Amazon ECR or Docker Hub.
 */
export class ContainerImageProvisioner extends Construct {
  public readonly containerImage: ecs.ContainerImage;
  public readonly ecrRepository?: ecr.IRepository;

  /**
   * Creates a container image configuration based on the provided source.
   * For ECR, it creates a new repository with image scanning and immutable tags.
   * For Docker Hub, it references the image directly.
   * @param scope The CDK Stack or Construct that this construct belongs to
   * @param id The logical ID of this construct
   * @param props Properties defining the image source, repository, and tag
   */
  constructor(scope: Construct, id: string, props: ContainerImageProvisionerProps) {
    super(scope, id);

    if (props.imageSource === 'ecr') {
      /**
       * Creates an Amazon ECR repository with the following configuration:
       * - repositoryName: Uses the provided repository name
       * - lifecycleRules: Retains the last 20 images to manage storage
       * - imageScanOnPush: Enables scanning for vulnerabilities on image push
       * - imageTagMutability: Sets tags as immutable to prevent accidental overwrites
       */
      let repository: ecr.IRepository;
      try {
        repository = ecr.Repository.fromRepositoryName(this, 'ImportedEcrRepo', props.repositoryName);
      } catch (error) {
        repository = new ecr.Repository(this, 'EcrRepo', {
          repositoryName: props.repositoryName,
          lifecycleRules: [
            {
              maxImageCount: 20,
              description: 'Retain last 20 images',
            },
          ],
          imageScanOnPush: true,
          imageTagMutability: ecr.TagMutability.IMMUTABLE,
          removalPolicy: cdk.RemovalPolicy.DESTROY, // Delete repository on stack deletion
        });
      }

      this.ecrRepository = repository;
      this.containerImage = ecs.ContainerImage.fromEcrRepository(repository, props.tag);
    } else if (props.imageSource === 'dockerhub') {
      /**
       * Configures a container image from Docker Hub using the repository name and tag.
       * Format: repositoryName:tag (e.g., nginx:latest)
       */
      this.containerImage = ecs.ContainerImage.fromRegistry(`${props.repositoryName}:${props.tag}`);
    } else {
      throw new Error(`Invalid imageSource: ${props.imageSource}. Must be 'ecr' or 'dockerhub'.`);
    }
  }
}