// lib/web-acl-construct.ts
import * as cdk from 'aws-cdk-lib';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';
// No need to import AppStackProps here if we pass necessary props explicitly

/**
 * Properties for the WebAclConstruct.
 */
export interface WebAclConstructProps {
  /**
   * The service name to be used in WAF metric names.
   */
  serviceName: string;
  /**
   * The environment name ('dev' or 'release') to be used in WAF metric names and rate limits.
   */
  environment: 'dev' | 'release';
  // Add any other WAF-specific configurations you might need here
}

/**
 * A CDK Construct that provisions a regional AWS WAFv2 WebACL with common rules.
 */
export class WebAclConstruct extends Construct {
  /**
   * The ARN of the created WebACL. Useful for associating with other resources.
   */
  public readonly webAclArn: string;

  /**
   * Creates a regional Web Application Firewall (WAF) ACL.
   * @param scope The parent CDK Stack or Construct.
   * @param id The logical ID of this construct.
   * @param props Configuration properties for the WebACL.
   */
  constructor(scope: Construct, id: string, props: WebAclConstructProps) {
    super(scope, id);

    // Define the rules for the WebACL
    const rules: wafv2.CfnWebACL.RuleProperty[] = [
      // 1) Rate limit
      {
        name: 'RateLimitRule',
        priority: 1,
        action: { block: {} },
        statement: {
          rateBasedStatement: {
            limit: props.environment === 'dev' ? 500 : 2000,
            aggregateKeyType: 'IP',
          },
        },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          sampledRequestsEnabled: true,
          metricName: 'RateLimitRule',
        },
      },
      // 2) Common OWASP + XSS + SQLi
      {
        name: 'CommonRuleSet',
        priority: 2,
        overrideAction: { none: {} },
        statement: {
          managedRuleGroupStatement: {
            vendorName: 'AWS',
            name: 'AWSManagedRulesCommonRuleSet',
          },
        },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          sampledRequestsEnabled: true,
          metricName: 'CommonRuleSet',
        },
      },
       {
        name: 'SQLiRuleSet',
        priority: 3,
        overrideAction: { none: {} },
        statement: {
          managedRuleGroupStatement: {
            vendorName: 'AWS',
            name: 'AWSManagedRulesSQLiRuleSet',
          },
        },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          sampledRequestsEnabled: true,
          metricName: 'SQLiRuleSet',
        },
      },
      // 3) IP reputation
      {
        name: 'IpReputation',
        priority: 4,
        overrideAction: { none: {} },
        statement: {
          managedRuleGroupStatement: {
            vendorName: 'AWS',
            name: 'AWSManagedRulesAmazonIpReputationList',
          },
        },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          sampledRequestsEnabled: true,
          metricName: 'IpReputation',
        },
      },
      // 4) Bot control (optional, extra fee)
      {
        name: 'BotControl',
        priority: 5,
        overrideAction: { none: {} },
        statement: {
          managedRuleGroupStatement: {
            vendorName: 'AWS',
            name: 'AWSManagedRulesBotControlRuleSet',
          },
        },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          sampledRequestsEnabled: true,
          metricName: 'BotControl',
        },
      },
    ];


    // Create the CfnWebACL resource
    const webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
      scope: 'REGIONAL', // Or 'CLOUDFRONT' if associating with CloudFront
      defaultAction: { allow: {} }, // Default behavior is to allow requests
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        sampledRequestsEnabled: true,
        metricName: `${props.serviceName}-${props.environment}-WAF`,
      },
      rules: rules, // Assign the defined rules
    });

    // Store the ARN in a public property
    this.webAclArn = webAcl.attrArn;
  }
}