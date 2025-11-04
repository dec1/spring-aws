#  AWS CDK Deployment

This project deploys a containerized Spring Boot web application to AWS Fargate with an Application Load Balancer (ALB), S3 access, and HTTPS support, using the AWS Cloud Development Kit (CDK). It supports separate dev and release environments and blue/green deployments in the release environment. Resources are tagged for easy filtering in the AWS Console.

## Prerequisites
- - Edit **`app-config.json`**, setting variables such as `serviceName`, `domainName` to match your AWS account and setup.
- AWS CLI locally [configured](../../../aws_cli/aws.md) eg with **profile** `<aws-profile>`  with credentials for AWS account to be used.

- `aws configure [sso] [ --profile <profile-name>]` 
    - for sso periodically also calls
    `aws sso login [--profile <profile-name>]` 

    ####
    - _Note_: If you are behind a **proxy** that rewrites certificates (e.g. zscaler you will probably need to add its cert to truststore for AWS cli and node.js)
        - [`set AWS_CA_BUNDLE=C:\Users\<user-name>\Documents\zone\mid\certs\zscaler.pem`]
        - [`set NODE_EXTRA_CA_CERTS=C:\Users\<user-name>\Documents\zone\mid\certs\zscaler.pem`]
        - temporarily disable node's checking of certs
            - [`set NODE_TLS_REJECT_UNAUTHORIZED=0`]
            otherwise may get `failed: Error: unable to get local issuer certificate` after otherwise successful deploy when cdk tries to verify that stack was deployed

####
- A custom domain registered in _AWS Route 53_ (see `domainName` in `app-config.json`).

####
- **Grafana Cloud**
    - If `wantGrafana` is set to true (eg in `app-config.json`), application level Metrics will made available in Grafana Cloud. You must then also set these environment variables to point at your Grafana Cloud account:
        ```yaml
        set/export GRAFANA_REMOTE_WRITE_URL=<value_no_quotes>
        set/export GRAFANA_USERNAME=<value_no_quotes>
        set/export GRAFANA_API_KEY=<value_no_quotes>
        ```
        which correspond to what in the grafana web configuration (when you create a new token) are currently named, respectively:
        `GCLOUD_HOSTED_METRICS_URL`, `GCLOUD_HOSTED_METRICS_ID`, `GCLOUD_RW_API_KEY`


### Setup and Run 
see full details in [cdk](../../cdk.md)
- `app>` **`npm install`**
    installs project "dependencies" and "devDependencies" listed in your _package.json_ into node_modules. 
- `app>` **`cdk bootstrap`** `[aws://<account>/<region>] --profile <aws-profile>`
    <!--
    - for k8s cdk didnt have enough permissions, so gave it _total admin_ via (todo: figure whats _enough_: principle of least privilege)
     `app> cdk bootstrap aws://<account>/<region>` `--cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess` `--profile <aws-profile>` 
     -->
- update/edit project files eg
    - container image (name and **tag**) `config/app-config.json`
 - push any new image (tag) referenced in project
- `app>` **`cdk synth`** `--profile <aws-profile>`
- deploy
    - dev
        `app>` **`cdk deploy`** `<serviceName>-dev --profile <aws-profile>`

            ✅  <serviceName>-dev

            ✨  Deployment time: 269.53s

            Outputs:
            <serviceName>-dev.AlbDnsName = <serviceName>-Appli-<randomId>-<elbId>.<region>.elb.amazonaws.com
            <serviceName>-dev.PrimaryFargateServiceName = <serviceName>-dev-blue-svc
            <serviceName>-dev.S3BucketName = <s3BucketName>
            <serviceName>-dev.ServiceUrl = https://dev.api.<domainName>
            <serviceName>-dev.WebAclArn = arn:aws:wafv2:<region>:<accountId>:regional/webacl/ApplicationWebAcl<resourceId>-<randomString>/<uuid>
            Stack ARN:
            arn:aws:cloudformation:<region>:<accountId>:stack/<serviceName>-dev/<stackId>

            ✨  Total time: 279.87s

    - release 
        `app> cdk deploy <serviceName>-release --profile <aws-profile>`

            ✅  <serviceName>-release
            ✨  Deployment time: 351.2s
            Outputs:
            <serviceName>-release.AlbDnsName = <serviceName>-Appli-<randomId>-<elbId>.<region>.elb.amazonaws.com
            <serviceName>-release.ApplicationFargateServicesDeployedGreenImageTagCC4E5111 = <imageTag>
            <serviceName>-release.BlueFargateServiceName = <serviceName>-release-blue-svc
            <serviceName>-release.GreenFargateServiceName = <serviceName>-release-green-svc
            <serviceName>-release.S3BucketName = <serviceName>-bucket-release
            <serviceName>-release.ServiceUrl = https://api.<domainName>
            <serviceName>-release.WebAclArn = arn:aws:wafv2:<region>:<accountId>:regional/webacl/ApplicationWebAcl<resourceId>-<randomString>/<uuid>
            Stack ARN:
            arn:aws:cloudformation:<region>:<accountId>:stack/<serviceName>-release/<stackId>
            ✨  Total time: 361.01s

    also  (only with `release`) _**trigger_blue_green**_ _Deployment_:
    ### 
    -  `powershell -File .\code_deploy\trigger_blue_green.ps1 -AwsProfile <aws-profile>` (_windows_)
    - `./code_deploy/trigger_blue_green.sh  --awsProfile <aws-profile>` (_linux_/_macos_)


 
        ```yaml
        {
            "deploymentId": "<some-deployment-id>"
        }
        ```

In AWS (Web) Console:
- `Developer Tools` - `CodeDeploy` - `Deployments` shows _deployment in progress_



##### Example Deployment
- `app> cdk deploy <serviceName> --profile <aws-profile>`
  - deploy the _dev_ (`<serviceName>-dev`) stack
      - Alternatvely: _release_  (`<serviceName>-release`) or _both_ (`<serviceName>-*`) 

            ✨  Deployment time: 11072.59s

            Outputs:
            <serviceName>-dev.AlbDnsName = <aws-profile>-ba-LoadB-<some-load-balancer-id>-<account>.<region>.elb.amazonaws.com
            <serviceName>-dev.ServiceUrl = https://dev.<domainName>
            Stack ARN:
            arn:aws:cloudformation:<region>:<account>:stack/<serviceName>-dev/
            eb607032-ff34-11ef-822a-0ef123456678

            ✨  Total time: 11079.28s


  - shows that you can connect (to the nginx server running in your container)
    - using _domainName_ 
        `curl` `https://dev.api.<domainName>/api`

        ```html
        <html>
        <head><title>404 Not Found</title></head>
        <body>
        <center><h1>404 Not Found</h1></center>
        <hr><center>nginx/1.27.4</center>
        </body>
        </html>
        ```

    - load balancer directly 
        `curl -k https://<aws-profile>-ba-LoadB-<some-load-balancer-id>-<account>.<region>.elb.amazonaws.com/api`
    
      - need `-k` to tell curl to bypass TLS certificate verification - necessary since the load balancer presents a cert for `dev.api.<domainName>/api` and not `<aws-profile>-ba-LoadB-<some-load-balancer-id>-<account>.<region>.elb.amazonaws.com/api`. Zscaler (if being used as intermediary) however will intercept forbid the connection the reply and  and forbids the connection since the host name on cert doesnt match sender address. Here' the output without zscalar:

      ```html
      <html>
      <head><title>404 Not Found</title></head>
      <body>
      <center><h1>404 Not Found</h1></center>
      <hr><center>nginx/1.27.4</center>
      </body>
      </html>
      ```

## Features

- **Application Load Balancer (ALB)**
  - Publicly accessible via HTTPS (port 443)
  - Integrated with AWS WAFv2 Web ACL for security (rate limiting, OWASP rules, bot control)
  - Route 53 Alias record pointing to ALB DNS

- **AWS Fargate Service**
  - Runs Docker containers in private subnets
  - IAM Task Role grants AWS permissions (e.g., S3 access)
  - Health checks configured for both container and ALB target groups
  - Auto-scaling based on CPU utilization
  - Automated blue/green deployments with AWS CodeDeploy
    - Blue and green services run simultaneously during deployments
    - Traffic shifting between blue and green is managed automatically by CodeDeploy
    - Auto-scaling applies independently to each (blue and green) service based on load

- **Networking**
  - Custom VPC with public and private subnets
  - Dedicated security groups for ALB and Fargate services
  - Restriction of default VPC security group using custom resource

- **Certificate Management**
  - ACM certificate created for custom domain via DNS validation
  - Route 53 CNAME records automatically managed for certificate validation

- **Storage**
  - S3 bucket for persistent data storage with encryption and versioning

- **Security**
  - Web Application Firewall (WAFv2) with common managed rules enabled
  - ALB integrated with WAF for protection against common web threats

- **Deployment Automation**
  - CDK TypeScript infrastructure-as-code
  - Blue/green deployment support with traffic shifting and manual approval window

- **Resource Tagging**
  - Resources tagged with service and environment for cost tracking and management

- **Logging and Monitoring**
  - Container logs streamed to AWS CloudWatch Logs (under `/aws/ecs/...` log groups)
  - Container-level health checks run inside ECS tasks; visible in the **ECS Console** under Tasks → Task Details → Health
  - ALB target group health checks monitored by the load balancer; metrics available in the **EC2 Console** → Load Balancers → Target Groups → Monitoring tab and via **CloudWatch Metrics** (namespace: ELB)
  - Enables observability of application health, request success, and troubleshooting through CloudWatch dashboards and alarms

---

#### Environments
Each environment has a dedicated **Stack** that can be deployed independently
- `dev`  
  - Subdomain: `dev.api.<domainName>`  
  - Simpler single Fargate service (blue only)  
  - Auto-scales between 1 and 2 tasks  
  - Lower rate limits on WAF rules
  - Stack `<serviceName>-dev`

- `release` (Production)  
  - Subdomain: `api.<domainName>`  
  - Blue/green deployments enabled  
  - Blue and green services run simultaneously during deployments  
  - CodeDeploy automatically shifts traffic from blue to green after health checks and approval  
  - Auto-scaling independently applies to blue and green services (blue: 1-10 tasks, green: 0-10 tasks)  
  - Full WAF protections and rate limits
  - Stack  `<serviceName>-release`

---
#### Health Checks
- can be customized eg in app-config.json

#### Auto-Scaling

- Auto-scaling controls the **number of running ECS tasks** (which each run one or more containers)
- Scaling is triggered by CPU utilization exceeding 70% threshold
- Blue service maintains between 1 (min) and 10 (max) tasks when active
- Green service scales between 0 (min) and 10 (max) tasks during deployments
- During blue/green deployments, green tasks scale up to receive traffic before blue tasks scale down


---

#### Blue/Green Deployments

- Available only in `release` environment  
- Managed by AWS CodeDeploy ECS deployment groups  
- Traffic is shifted gradually from blue to green service automatically  
- Includes manual approval window and termination wait time to control rollout and rollback

---

#### Resource Tagging

- All AWS resources tagged with `Service` and `Environment` for identification and billing  
- Tags propagate to VPC, ALB, ECS services, S3 bucket, ECR repository, etc.  
- Tags are visible and filterable in AWS Console's **Resource Groups & Tag Editor** or within individual service consoles  

---


#### Tests
- prerequisite
  - `app> npm install --save-dev jest @types/jest ts-jest`

- run
    - `app> npx jest`

      ```yaml
        PASS  test/app.test.ts
        PASS  test/app-config-reader.test.ts (6.891 s)
        .......
        Test Suites: 2 passed, 2 total
        Tests:       5 passed, 5 total
        Snapshots:   0 total
        Time:        7.836 s
      ```




---
#### Cert signing problems - workaround

- Somehow the cdk deploy didn't create the CNAME key-value pair as it should have.
    `Route 53` - `Hosted zones` - `<domainName>`
    - **Record (CNAME)** : `<some_value>.dev.api.<domainName>`- `<some_value>.zbfgrmvvlj.acm-validations.aws`
    that aws required as proof of ownership of the domain

-  the certificate (signing) was stuck in pending as could be seen in 
    `AWS Certificate Manager` - `Certificate` - `<some_value>`
    where the key value pair could also be seen

    I had to **manually** create the CNAME record in aws console, for the deploy to succeed.

    - _Note_: it did create the A record pointing at the loadbalancer 
    **Record (A)** : ` dev.api.<domainName>` - `dualstack.<aws-profile>-ba-LoadB-<some-load-balancer-id>-<account>.<region>.elb.amazonaws.com.` 


    I had to manually delete  record `dev.api.<domainName>` of type `A` for hosted zone `<domainName>`,  since `cdk deploy` was getting stuck in (re: deploy) trying to re-create it


---

#### Automatic Redirects
To redirect `old.api.<domainName>` to `some.other.com`, you can add a listener rule to your ALB:

```typescript
listener.addAction('RedirectOldApi', {
  priority: 5,
  conditions: [
    elbv2.ListenerCondition.hostHeaders(['old.api.<domainName>']),
  ],
  action: elbv2.ListenerAction.redirect({
    host: 'some.other.com',
    permanent: true,
  }),
});

```
This instructs the ALB to respond with a permanent redirect (HTTP 301) when it receives requests for old.api.<domainName>.
Additionally, you'll need to create the DNS record for old.api.<domainName> pointing to your ALB:

```typescript
new route53.ARecord(this, 'OldApiRecord', {
  zone: hostedZone,
  recordName: 'old.api',
  target: route53.RecordTarget.fromAlias(new route53Targets.LoadBalancerTarget(loadBalancer)),
});
```




#### DoS Protection and API Management
- #### AWS Shield
  - **Standard** provides foundational automatic protection against network- and transport-layer DDoS attacks (Layer 3 & 4). It is always active on AWS-managed services like ALB and API Gateway.

  - **Advanced** is an optional paid upgrade offering enhanced DDoS protection, including:  
    - 24×7 access to the AWS DDoS Response Team (DRT)  
    - Detailed attack diagnostics and real-time notifications  
    - Cost protection against scaling charges from large DDoS attacks  
    - Integration with AWS WAF for automated mitigation rules  

- ##### AWS WAF
  protects your application at the HTTP layer (Layer 7) by filtering malicious web traffic, enforcing rate limits per IP address, and blocking common web exploits. It is typically used with ALB or API Gateway for deep web-layer security.

- ##### API Gateway
  focuses on API-specific management features such as authentication, authorization, API keys, usage plans, and request throttling per client. It benefits from Shield’s network-layer protection and can be optionally combined with WAF for enhanced application-layer filtering.

**How they work together:**

- Use **Shield (Standard or Advanced) + WAF** to secure your web applications and APIs from network attacks and common web exploits (as this project does).

- Use **API Gateway** when you want to offload API management tasks like:  
  - Authenticating external clients with tokens or IAM  
  - Enforcing usage quotas or throttling per API consumer  
  - Issuing and managing API keys for third-party developers  
  
  and are willing to pay the extra costs
 

**In practice:**  
You often use all three together — Shield for automatic DDoS defense, WAF for customizable HTTP protections, and API Gateway to manage API traffic and client access without adding complexity to your application code.



This way, you get layered security and management:

| Layer           | Service                    | Responsibilities                                        |
|-----------------|----------------------------|--------------------------------------------------------|
|  Layer 4  | AWS Shield Standard/Advanced | Automatic protection from volumetric DDoS attacks; Advanced adds expert support and billing safeguards |
|  Layer 7 | AWS WAF                   | Filtering, rate limiting per IP address, blocking exploits |
| API Management  | API Gateway                | Authentication, authorization, usage plans, throttling |


