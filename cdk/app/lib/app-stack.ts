// lib/app-stack.ts

import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as constructs from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';


import { WebAclConstruct } from './constructs/web-acl';
import { VpcConstruct, VpcConstructProps } from './constructs/vpc';
import { StorageConstruct, StorageConstructProps } from './constructs/storage';
import { IamConstruct } from './constructs/iam';
import { CertificateConstruct, DnsRecordsConstruct } from './constructs/domain';
import { LoadBalancerConstruct } from './constructs/platform/ecs/loadbalancer';
import { EcsClusterConstruct } from './constructs/platform/ecs/cluster';
import { FargateServiceConstruct } from './constructs/platform/ecs/service';
import { K8sPlatform } from './constructs/platform/__eks/__compute';
import { ContainerImageProvisioner } from './constructs/image-provisioner';

export interface AppStackProps extends cdk.StackProps {
  repositoryName: string;
  tag: string;
  serviceName: string;
  imageSource: 'ecr' | 'dockerhub';
  computePlatform: 'ecs' | 'kubernetes';
  stagingEnvironment: 'dev' | 'release';
  
  apexDomain: string;
  hostedZoneId: string;
  hostnamePrefix: string;
  healthChecks: {
    containerHealthCheckCommand: string[];
    containerHealthCheckRetries: number;
    containerHealthCheckStartPeriod: cdk.Duration;
    containerHealthCheckTimeout: cdk.Duration;
    containerHealthCheckInterval: cdk.Duration;
    targetGroupHealthCheckPath: string;
    targetGroupHealthCheckInterval: cdk.Duration;
    targetGroupHealthCheckTimeout: cdk.Duration;
    targetGroupHealthyThresholdCount: number;
  };
  s3BucketName?: string;
  s3BucketIsCdkManaged?: boolean;
  s3BucketMaxNoncurrentVersions?: number;
  s3BucketNoncurrentVersionExpirationDays?: number;
  terminationWaitTimeMinutes?: number;
  greenImageTag?: string;
  appPortNum: number;
  wantGrafana?: boolean;
}

export class AppStack extends cdk.Stack {
  public readonly webAclArnOutput: cdk.CfnOutput;
  public readonly albDnsNameOutput: cdk.CfnOutput;
  public readonly serviceUrlOutput: cdk.CfnOutput;
  public readonly s3BucketNameOutput?: cdk.CfnOutput;

  constructor(scope: constructs.Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    // Web ACL (WAFv2)
    const webAcl = new WebAclConstruct(this, 'ApplicationWebAcl', {
      serviceName: props.serviceName,
      environment: props.stagingEnvironment,
    });

    // Tagging
    cdk.Tags.of(this).add('MyService', props.serviceName);
    cdk.Tags.of(this).add('MyStagingEnvironment', props.stagingEnvironment);
    cdk.Tags.of(this).add('MyComputePlatform', props.computePlatform);
    cdk.Tags.of(this).add('myCdkStack', `${props.serviceName}-${props.stagingEnvironment}-${props.computePlatform}`);

    // VPC + Security Groups
    const vpcProps: VpcConstructProps = {
      restrictDefaultSecurityGroup: false,
      appPortNum: props.appPortNum,

      // - maxAzs: Number of Availability Zones to use (minimum 2 required for ALB high availability)
      //   * Dev: 2 AZs (cost optimization)
      //   * Release: 3 AZs (better redundancy across AZs)
      maxAzs: props.stagingEnvironment === 'dev' ? 2 : 3,
        
      // - natGateways: Number of NAT Gateways for private subnet internet access
      //   * Each NAT Gateway requires 1 Elastic IP and costs ~$32/month
      //   * 1 NAT Gateway is sufficient for both environments (shared across all private subnets)
      //   * Using more than 1 increases redundancy but also cost and EIP usage
      natGateways: props.stagingEnvironment === 'dev' ? 1 : 1,
    };
    const network = new VpcConstruct(this, 'NetworkInfrastructure', vpcProps);

    // Pass bucket name and create flag if provided
    const storageProps: StorageConstructProps = {};
    if (props.s3BucketName) {
    storageProps.bucketName = props.s3BucketName;
    storageProps.createIfNecessary = props.s3BucketIsCdkManaged ?? true;
    storageProps.maxNoncurrentVersions = props.s3BucketMaxNoncurrentVersions ?? 10;
    storageProps.noncurrentVersionExpirationDays = props.s3BucketNoncurrentVersionExpirationDays ?? 1;
    }
    const storage = new StorageConstruct(this, 'ApplicationStorage', storageProps);
    
    // Output bucket name if bucket exists
    if (storage.dataBucket) {
      this.s3BucketNameOutput = new cdk.CfnOutput(this, 'S3BucketName', {
        value: storage.dataBucket.bucketName,
        description: `Name of the S3 bucket for ${props.stagingEnvironment} environment`,
      });
    }

    // IAM for tasks
    const iam = new IamConstruct(this, 'ApplicationIamRoles');

    // Container image
    const imageProvisioner = new ContainerImageProvisioner(this, 'AppContainerImage', {
      imageSource:    props.imageSource,
      repositoryName: props.repositoryName,
      tag:            props.tag,
    });

    // DNS / Certificate - construct FQDN from hostname prefix + apex domain
    const fqdn = `${props.hostnamePrefix}.${props.apexDomain}`;
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: props.hostedZoneId,
      zoneName:     props.apexDomain,
    });
    const acmCertificate = new CertificateConstruct(this, 'SslCertificateResource', {
      fqdn,
      hostedZone,
    });



    // ECS
    if (props.computePlatform === 'ecs') {

      // Load Balancer + Listener
	  const alb = new LoadBalancerConstruct(this, 'ApplicationLoadBalancerSetup', {
	      vpc:         network.vpc,
	      albSg:       network.albSg,
	      certificate: acmCertificate.certificate,
	      webAclArn:   webAcl.webAclArn,
	    });
    
      const ecsCluster = new EcsClusterConstruct(this, 'ApplicationEcsCluster', {
        vpc: network.vpc,
      });
      
      // Build environment variables for containers
      const containerEnvironment: Record<string, string> = {
        AWS_REGION: this.region,
        SERVICE_NAME: props.serviceName,
        STAGE: props.stagingEnvironment,
      };
      
      // Add S3 bucket name if available
      if (storage.dataBucket) {
        containerEnvironment.S3_DATA_BUCKET = storage.dataBucket.bucketName;
      }
      
      const fargateServices = new FargateServiceConstruct(this, 'ApplicationFargateServices', {
        cluster:                     ecsCluster.cluster,
        taskRole:                    iam.taskRole,
        containerImage:              imageProvisioner.containerImage,
        fargateSg:                   network.fargateSg,
        listener:                    alb.listener,
        vpc:                         network.vpc,
        serviceName:                 props.serviceName,
        stagingEnvironment:          props.stagingEnvironment,
        healthChecks:                props.healthChecks,
        environment:                 containerEnvironment,
        terminationWaitTimeMinutes:  props.terminationWaitTimeMinutes,
        appPortNum:                  props.appPortNum,
        imageSource:                 props.imageSource,
        repositoryName:              props.repositoryName,
        tag:                         props.tag,
        wantGrafana:                 props.wantGrafana,
      });

      new DnsRecordsConstruct(this, 'ServiceDnsAliasRecords', {
        hostedZone,
        hostnamePrefix: props.hostnamePrefix,
        loadBalancer:   alb.loadBalancer,
      });

      if (fargateServices.blueService && fargateServices.greenService) {
        new cdk.CfnOutput(this, 'BlueFargateServiceName', {
          value:       fargateServices.blueService.serviceName,
          description: 'Name of the blue (current) Fargate service',
        });
        new cdk.CfnOutput(this, 'GreenFargateServiceName', {
          value:       fargateServices.greenService.serviceName,
          description: 'Name of the green (new/staging) Fargate service',
        });
      } else if (fargateServices.blueService) {
        new cdk.CfnOutput(this, 'PrimaryFargateServiceName', {
          value:       fargateServices.blueService.serviceName,
          description: 'Name of the primary Fargate service',
        });
      }


       this.albDnsNameOutput = new cdk.CfnOutput(this, 'AlbDnsName', {
        value:       alb.loadBalancer.loadBalancerDnsName,
        description: 'DNS name of the Application Load Balancer',
      });
      this.serviceUrlOutput = new cdk.CfnOutput(this, 'ServiceUrl', {
        value:       `https://${fqdn}`,
        description: 'URL of the service',
      });
      
    }
    
    // EKS
    else if (props.computePlatform === 'kubernetes') {
    //   const k8sPlatform = new K8sPlatform(this, 'K8sPlatform', network.vpc);
    //   // Pass cert and WAF ARN to EKS platform for Ingress configuration
    //   const outputs = k8sPlatform.deploy({
    //     taskRole:            iam.taskRole,
    //     containerImage:      imageProvisioner.containerImage,
    //     containerImageName:  `${props.repositoryName}:${props.tag}`,
    //     securityGroup:       network.fargateSg, // This SG is for Fargate, might need adjustment for EKS nodes
    //     vpc:                 network.vpc,
    //     serviceName:         props.serviceName,
    //     stagingEnvironment:  props.stagingEnvironment,
    //     healthChecks:        props.healthChecks,
    //     appPortNum:          props.appPortNum,
    //     //certificateArn:      acmCertificate.certificate.certificateArn, // Pass ACM cert ARN
    //     // webAclArn:           webAcl.webAclArn, // Pass WAF ARN
    //     //fqdn:                fqdn, // Pass FQDN for Ingress host
    //     // We no longer pass listener or ALB for K8s here, as Ingress Controller manages it
    //   });

    //   // The K8sPlatform should output the Ingress hostname
    //   //const k8sIngressHostname = outputs.ingressHostname;

    //   new DnsRecordsConstruct(this, 'K8sDnsAliasRecords', {
    //     hostedZone,
    //     hostnamePrefix:     props.hostnamePrefix,
    //     //eksAlbDnsName:      k8sIngressHostname, // Pass the Ingress hostname for Route 53
    //     // loadBalancer is not used for K8s
    //   });

    //   this.albDnsNameOutput = new cdk.CfnOutput(this, 'AlbDnsName', {
    //     value:       "", // k8sIngressHostname,
    //     description: 'DNS name of the EKS Ingress-managed Application Load Balancer',
    //   });


    //   this.serviceUrlOutput = new cdk.CfnOutput(this, 'ServiceUrl', {
    //     value: `https://${fqdn}`,
    //     description: 'URL of the service (via EKS Ingress)',
    //   }); 

    }
    else {
      console.error(`Unknown computePlatform: ${props.computePlatform}`);
    }


    this.webAclArnOutput = new cdk.CfnOutput(this, 'WebAclArn', {
      value:       webAcl.webAclArn,
      description: 'ARN of the associated Web Application Firewall (WAF) ACL',
    });
  }
}