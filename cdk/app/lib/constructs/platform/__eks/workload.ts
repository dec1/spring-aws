// lib/constructs/platform/k8s/workload.ts

import * as cdk from 'aws-cdk-lib';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as k8s from 'aws-cdk-lib/kubernetes';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { ContainerImage } from 'aws-cdk-lib/aws-ecs'; // Assuming this comes from common types

// Define specific properties for the K8s workload
export interface K8sWorkloadConstructProps {
  cluster: eks.Cluster; // The EKS cluster itself
  taskRole: iam.IRole; // For consistency, though K8s typically uses K8s Service Accounts directly
  containerImage: ContainerImage; // For consistency, though K8s uses string image name
  containerImageName: string; // The "repository:tag" string for K8s deployment
  securityGroup: cdk.aws_ec2.ISecurityGroup; // For worker nodes if applicable
  vpc: cdk.aws_ec2.IVpc; // For context
  serviceName: string;
  stagingEnvironment: string;
  healthChecks: {
    containerHealthCheckCommand: string[];
    targetGroupHealthCheckPath: string; // Used for Ingress health checks
    targetGroupHealthCheckInterval: cdk.Duration;
    targetGroupHealthCheckTimeout: cdk.Duration;
    targetGroupHealthyThresholdCount: number;
  };
  appPortNum: number;
  certificateArn: string; // ACM certificate ARN for Ingress
  webAclArn: string; // WAF ACL ARN for Ingress
  fullDomainName: string; // Full domain name for Ingress host (e.g., dev.api.yourdomain.com)
}

export class K8sWorkloadConstruct extends Construct {
  public readonly ingressAlbDnsName: string;

  constructor(scope: Construct, id: string, cluster: eks.Cluster, props: K8sWorkloadConstructProps) {
    super(scope, id);

    // Kubernetes Deployment
    const deployment = new k8s.KubeDeployment(this, 'AppDeployment', {
      metadata: {
        name: props.serviceName,
        labels: { app: props.serviceName, environment: props.stagingEnvironment },
      },
      spec: {
        replicas: 2, // Example replica count
        selector: { matchLabels: { app: props.serviceName } },
        template: {
          metadata: { labels: { app: props.serviceName, environment: props.stagingEnvironment } },
          spec: {
            // If you need to attach IAM role to service account for pods, you would do it here:
            // serviceAccountName: 'your-k8s-service-account',
            containers: [{
              name: props.serviceName,
              image: props.containerImageName,
              ports: [{ containerPort: props.appPortNum }],
              // K8s Liveness and Readiness Probes using the health check command
              livenessProbe: {
                exec: { command: props.healthChecks.containerHealthCheckCommand },
                initialDelaySeconds: 30, // Give app time to start
                periodSeconds: 10,
                timeoutSeconds: 5,
                failureThreshold: 3,
              },
              readinessProbe: {
                exec: { command: props.healthChecks.containerHealthCheckCommand },
                initialDelaySeconds: 10,
                periodSeconds: 5,
                timeoutSeconds: 3,
                failureThreshold: 2,
              },
            }],
          },
        },
      },
    });

    // Kubernetes Service (ClusterIP type for internal routing, managed by Ingress)
    const service = new k8s.KubeService(this, 'AppService', {
      metadata: {
        name: props.serviceName,
        labels: { app: props.serviceName },
      },
      spec: {
        ports: [{ port: 80, targetPort: props.appPortNum }], // Service port 80 maps to appPortNum
        selector: { app: props.serviceName },
        type: 'ClusterIP', // Change from NodePort to ClusterIP
      },
    });

    // Kubernetes Ingress Resource using ALB Ingress Controller annotations
    // This will provision an ALB and manage routing to the KubeService
    const ingress = new k8s.KubeIngress(this, 'AppIngress', {
      metadata: {
        name: `${props.serviceName}-ingress-${props.stagingEnvironment}`,
        annotations: {
          'kubernetes.io/ingress.class': 'aws-load-balancer',
          'alb.ingress.kubernetes.io/scheme': 'internet-facing',
          'alb.ingress.kubernetes.io/target-type': 'ip', // Use 'ip' for Fargate or if IP-based routing is preferred
          'alb.ingress.kubernetes.io/listen-ports': '[{"HTTP": 80}, {"HTTPS": 443}]',
          'alb.ingress.kubernetes.io/certificate-arn': props.certificateArn,
          // Redirect HTTP to HTTPS
          'alb.ingress.kubernetes.io/actions.ssl-redirect': '{"Type": "redirect", "RedirectConfig": { "Protocol": "HTTPS", "Port": "443", "StatusCode": "HTTP_301"}}',
          'alb.ingress.kubernetes.io/ssl-redirect': '443', // Simpler annotation for SSL redirect
          'alb.ingress.kubernetes.io/backend-protocol': 'HTTP', // Protocol between ALB and your app
          // Health check for the ALB target group
          'alb.ingress.kubernetes.io/healthcheck-path': props.healthChecks.targetGroupHealthCheckPath,
          'alb.ingress.kubernetes.io/healthcheck-interval-seconds': String(props.healthChecks.targetGroupHealthCheckInterval.toSeconds()),
          'alb.ingress.kubernetes.io/healthcheck-timeout-seconds': String(props.healthChecks.targetGroupHealthCheckTimeout.toSeconds()),
          'alb.ingress.kubernetes.io/healthy-threshold-count': String(props.healthChecks.targetGroupHealthyThresholdCount),
          'alb.ingress.kubernetes.io/success-codes': '200',
          // WAF Integration
          'alb.ingress.kubernetes.io/wafv2-acl-arn': props.webAclArn,
          // Add tags to the ALB created by the Ingress Controller
          'alb.ingress.kubernetes.io/tags': `Environment=${props.stagingEnvironment},Service=${props.serviceName}`,
        },
      },
      spec: {
        rules: [{
          host: props.fullDomainName,
          http: {
            paths: [{
              path: '/',
              pathType: 'Prefix',
              backend: {
                service: {
                  name: service.metadata.name, // Reference the KubeService by name
                  port: {
                    number: 80, // Service port (will be redirected to 443 by ALB)
                  },
                },
              },
            }],
          },
        }],
      },
    });

    // The trick to get the ALB DNS name from KubeIngress into CDK at synth time:
    // The CfnIngress (L1 construct) has a `attrStatusLoadBalancerIngressHostname` property
    // which effectively represents `ingress.status.loadBalancer.ingress[0].hostname`.
    // This will be a CloudFormation pseudo-parameter that resolves at deployment time.
    this.ingressAlbDnsName = ingress.attrStatusLoadBalancerIngressHostname;

    // Add a dependency to ensure the Ingress is fully provisioned before trying to use its hostname
    // Although `attrStatusLoadBalancerIngressHostname` is a token, adding this clarifies intent.
    this.node.addDependency(ingress);

    // Optional: Output the K8s Ingress DNS name for verification
    new cdk.CfnOutput(this, 'K8sIngressAlbDnsName', {
      value: this.ingressAlbDnsName,
      description: 'The DNS name of the ALB created by the EKS Ingress Controller.',
    });
  }
}