
A _Spring Boot **Web Application** together with **IaC** (Infrastructure as Code)_ 
 suitable for setting up cloud infrastructure and _deploying_ the application to _**AWS** (Amazon Web Services)_. 

The IaC is modular and extensible, built with best practices in mind including:
- _Security_: WAF with OWASP rules, rate limiting, and bot control
- _Monitoring_: Optional Grafana Cloud integration for application metrics
- _Deployment_: Automated blue/green deployments with zero-downtime releases (to AWS Fargate/ECS)
- _Scaling_: Auto-scaling based on CPU utilization


The infrastructure code uses _AWS CDK_ rather than cloud-agnostic tools like Terraform or Pulumi. CDK has some practical advantages:
- _No state files to manage_ - CDK uses CloudFormation under the hood, which manages state in AWS. With Terraform and Pulumi, you need both your code and separate state files to modify infrastructure. With CDK, you only need the code - CloudFormation tracks what's deployed, so you can run deployments from any machine with AWS credentials.

- _Always up-to-date_ - New AWS features are available immediately in CDK, with no waiting for third-party tool updates to catch up

This repository contains two main parts that work together:

## Structure

```
├── cdk/          Infrastructure definitions (AWS resources)
├── spring/       The application (Kotlin Spring Boot)
└── README.md     This file
```


### 1. Infrastructure (`cdk/`)
Defines and creates the cloud resources the application needs to run such as:
- Compute environments to run the app (AWS Fargate/ECS)
- Storage and networking
- Security and access controls

Deployment follows best practices with separate _dev_ and _release_ environments. The release environment includes blue/green deployment for zero-downtime updates.See the dedicated [readme.md](cdk/readme.md) in the _cdk_ sub-directory for more details.

### 2. Application (`spring/`)
The actual application code that runs on the infrastructure:
- Built with Kotlin and Spring Boot
- Provides REST APIs (documented with Swagger UI)
- Can run locally or in the cloud

See the dedicated [readme.md](spring/readme.md) in the _spring_ sub-directory for more details.

## Usage
- Run and test the application locally either from source code or as a containerized image
- Deploy infrastructure when ready to deploy in the cloud 
- One or both can also be performed as part of CI/CD pipeline