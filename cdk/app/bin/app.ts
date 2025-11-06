// bin/app.ts

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AppStack, AppStackProps } from '../lib/app-stack';
import { ImageConfig } from '../config/image-config';
import { loadAppConfig, ResolvedAppConfig } from '../config/app-config-reader';

const app = new cdk.App();

// Load the resolved application configuration once using the reader function
const resolvedAppConfig: ResolvedAppConfig = loadAppConfig(app.node.tryGetContext('myAppConfig'));

const account = resolvedAppConfig.account;
const region  = resolvedAppConfig.region;

const serviceName = resolvedAppConfig.serviceName;
const apexDomain  = resolvedAppConfig.apexDomain;
const hostedZoneId = resolvedAppConfig.hostedZoneId;

const terminationWaitTimeMinutes = resolvedAppConfig.terminationWaitTimeMinutes;
const appPortNum = resolvedAppConfig.appPortNum;

//-----------------------------------------------------------------------------------------

// Create both ECS and Kubernetes stacks for each environment
createStack('dev');
createStack('release');

//createStack('k8s-dev');
//createStack('k8s-release');

function createStack(name: string) {
  // Figure out the stack name based on the serviceName and environment
  const stackName = `${serviceName}-${name}`;

  // Pick the nested EnvConfig for this environment
  const envCfg = resolvedAppConfig.envConfigs[name];
  if (!envCfg) {
    throw new Error(`No configuration found for name '${name}'.`);
  }

  // Log details of stack being used
  console.log(`[CDK] Creating stack: ${stackName}`);
  console.log(`[CDK] Using image for environment '${name}':`);
  console.log(`       source: ${envCfg.imageSource}`);
  console.log(`       repository: ${envCfg.repositoryName}`);
  console.log(`       tag: ${envCfg.imageTag}`);
  console.log(`       computePlatform: ${envCfg.computePlatform}`);

  // Build ImageConfig using nested config values
  let imageConfig: ImageConfig = new ImageConfig(
    envCfg.imageSource,
    envCfg.repositoryName,
    envCfg.imageTag,
    appPortNum,
    envCfg.healthCheckCommand,
    envCfg.healthCheckPath
  );

  // pick up optional overrides (now from nested envCfg)
  const props: Partial<AppStackProps> = {
    serviceName,
    stagingEnvironment: envCfg.stagingEnvironment,
    computePlatform:    envCfg.computePlatform,
    apexDomain,
    hostedZoneId,
    hostnamePrefix:     envCfg.hostnamePrefix!,
    s3BucketName:       envCfg.s3BucketName,
    s3BucketIsCdkManaged: envCfg.s3BucketIsCdkManaged,

    terminationWaitTimeMinutes,
    appPortNum,

    // tell CDK which account/region we're deploying to
    env: { account, region },

    wantGrafana: resolvedAppConfig.wantGrafana ?? false,
  };

  // Apply the nested image + health‐check settings
  imageConfig.applyConfig(props);

  // === Explicitly set props.tag ===
  props.tag = envCfg.imageTag;

  return new AppStack(app, stackName, props as AppStackProps);
}