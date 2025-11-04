// lib/loadbalancer-construct.ts
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';

/**
 * @module loadbalancer-construct
 * This module defines and provisions the Application Load Balancer (ALB),
 * its primary HTTPS listener, and integrates it with AWS WAFv2 for security.
 * Target groups and specific routing rules for application services are typically
 * configured separately and attached to the listener created by this construct.
 */

/**
 * Properties required for the LoadBalancerConstruct.
 */
export interface LoadBalancerConstructProps {
  /** The VPC in which the Application Load Balancer will be deployed. */
  vpc: ec2.IVpc;
  /** The security group to be associated with the ALB. */
  albSg: ec2.ISecurityGroup;
  /** The SSL/TLS certificate (from ACM) to be used by the HTTPS listener. */
  certificate: acm.ICertificate;
  /** The ARN of the WebACL (AWS WAFv2) to associate with the ALB. */ // Updated description
  webAclArn: string; // This ARN will now come from the WebAclConstruct
}

/**
 * A CDK Construct that provisions an Application Load Balancer (ALB) with an HTTPS listener
 * and integrates it with AWS WAF for web application security.
 */
export class LoadBalancerConstruct extends Construct {
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly listener: elbv2.ApplicationListener;

  /**
   * Creates the Application Load Balancer, its HTTPS listener, and associates the WebACL.
   * @param scope The parent CDK Stack or Construct.
   * @param id The logical ID of this construct.
   * @param props Configuration properties for setting up the load balancer.
   */
  constructor(scope: Construct, id: string, props: LoadBalancerConstructProps) {
    super(scope, id);

    /**
     * Provisions an Application Load Balancer (ALB).
     * - vpc: Deployed into the specified VPC.
     * - internetFacing: True, making it accessible from the internet.
     * - securityGroup: Uses the provided ALB-specific security group.
     * - vpcSubnets: Placed in the public subnets of the VPC.
     * Consider enabling `deletionProtection: true` for production ALBs.
     */
    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: props.albSg,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      // deletionProtection: true, // Recommended for production environments
    });

    /**
     * Creates an HTTPS listener on port 443 for the ALB.
     * - port: 443 for HTTPS traffic.
     * - protocol: HTTPS.
     * - certificates: Uses the provided SSL/TLS certificate from ACM.
     * - open: True, allows inbound traffic on port 443 from the internet to the ALB (as controlled by the ALB's security group).
     * - defaultAction: Returns a fixed 404 response if no listener rules with higher priority match an incoming request.
     * This serves as a catch-all for unhandled paths.
     */
    this.listener = this.loadBalancer.addListener('HttpsListener', {
      port: 443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: [props.certificate],
      open: true,
      defaultAction: elbv2.ListenerAction.fixedResponse(404, {
        contentType: 'text/plain',
        messageBody: 'Resource Not Found - No matching listener rule for this path.',
      }),
    });

    /**
     * Associates the specified AWS WAFv2 WebACL with the ALB.
     * This enables WAF protection (e.g., rate limiting, SQLi protection) for traffic
     * handled by this listener. The association must be made with the ALB's ARN,
     * not the listener's ARN.
     */
    const webAclAssociation = new wafv2.CfnWebACLAssociation(this, 'WebAclAssociation', {
      resourceArn: this.loadBalancer.loadBalancerArn, // <-- CORRECT: Use the ALB's ARN
      webAclArn: props.webAclArn, // ARN of the WebACL
    });

    // The dependency is important to ensure the listener exists before the association is created.
    // Although we are now associating with the ALB, depending on the listener might still be a good idea
    // or depending directly on the loadBalancer might be sufficient. Let's keep the dependency on the listener
    // as it was in your original code, as it implies the intent that the association is for traffic
    // hitting this specific listener.
    webAclAssociation.node.addDependency(this.listener);


    // --- Outputting Load Balancer DNS Name (optional)
    // The AppStack already has outputs for the ALB DNS, which is the correct place for
    // stack-level outputs. This output below is just an example if you needed
    // to reference the ALB DNS name from *outside* this construct but within the same stack.
    /*
    new cdk.CfnOutput(this, 'LoadBalancerDns', {
      value: this.loadBalancer.loadBalancerDnsName,
      description: 'The DNS name of the Application Load Balancer',
    });
    */
  }
}