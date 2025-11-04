// config/app-config-reader.ts

import * as fs from 'fs';
import * as path from 'path';

/**
 * Interface representing environment-specific configuration.
 */
export interface EnvConfig {
  readonly computePlatform: 'ecs' | 'kubernetes';
  readonly stagingEnvironment: 'dev' | 'release';
  readonly imageSource: 'ecr' | 'dockerhub';
  readonly repositoryName: string;
  readonly imageTag: string;
  /** optional override for the container health-check command */
  readonly healthCheckCommand?: string[];
  /** optional override for the container health-check path */
  readonly healthCheckPath?: string;
  /** optional explicit S3 bucket name for this environment */
  readonly s3BucketName?: string;
  /** whether to import bucket should be created/deleted by cdk automatically or is independent*/
  readonly bucketIsCdkManaged?: boolean; 
  /** subdomain (e.g. 'dev.api', 'k8s.dev.api', etc.) */
  readonly subdomain?: string;
}

/**
 * Fully resolved application configuration.
 */
export interface ResolvedAppConfig {
  readonly account: string;
  readonly region: string;
  readonly serviceName: string;
  readonly domainName: string;
  readonly hostedZoneId: string;
  readonly appPortNum: number;
  /** map of all environment configs by key ('dev','k8s-dev','release','k8s-release') */
  readonly envConfigs: Record<string, EnvConfig>;
  readonly terminationWaitTimeMinutes: number;
  readonly wantGrafana?: boolean;
}

/**
 * Load and resolve the application configuration.
 */
export function loadAppConfig(context: any): ResolvedAppConfig {
  let baseConfig: Record<string, any> = {};

  if (
    context &&
    context.myAppConfig &&
    typeof context.myAppConfig === 'object'
  ) {
    console.log('Using configuration from CDK context');
    baseConfig = context.myAppConfig;
  } else {
    const cfgFile = path.join(process.cwd(), 'config/app-config.json');
    try {
      const raw = fs.readFileSync(cfgFile, 'utf-8');
      baseConfig = JSON.parse(raw);
      console.log(`Loaded configuration from ${cfgFile}`);
    } catch (e: any) {
      if (e.code !== 'ENOENT') console.error(`Error reading ${cfgFile}`, e);
      else console.log(`No config file; using defaults and environment variables`);
    }
  }

  // Top-level fallbacks: context/file → env → error (no hard-coded defaults for required fields)
  const account = baseConfig.account ?? process.env.CDK_DEFAULT_ACCOUNT;
  const region  = baseConfig.region  ?? process.env.CDK_DEFAULT_REGION;
  const serviceName = baseConfig.serviceName ?? process.env.CDK_SERVICE_NAME;
  const domainName  = baseConfig.domainName  ?? process.env.CDK_DOMAIN_NAME;
  const hostedZoneId = baseConfig.hostedZoneId ?? process.env.CDK_HOSTED_ZONE_ID ?? '';
  const appPortNum   = Number(baseConfig.appPortNum ?? process.env.CDK_APP_PORT_NUM ?? 3000);
  const terminationWaitTimeMinutes =
    Number(baseConfig.terminationWaitTimeMinutes ?? process.env.CDK_TERMINATION_WAIT_TIME_MINUTES ?? 5);
  const wantGrafana = baseConfig.wantGrafana === false;

  // --- Fail fast with clear messages for required fields ---
  if (!account) {
    throw new Error('CDK_DEFAULT_ACCOUNT is required (via context, config file, or env)');
  }
  if (!region) {
    throw new Error('CDK_DEFAULT_REGION is required (via context, config file, or env)');
  }
  if (!serviceName) {
    throw new Error('CDK_SERVICE_NAME is required (via context, config file, or env)');
  }
  if (!domainName) {
    throw new Error('CDK_DOMAIN_NAME is required (via context, config file, or env)');
  }

  // Extract each env config
  function extractEnv(key: string): EnvConfig {
    const raw = (baseConfig[key] as Record<string, any>) || {};
    return {
      computePlatform:           raw.computePlatform as 'ecs' | 'kubernetes',
      stagingEnvironment:        raw.stagingEnvironment as 'dev' | 'release',
      imageSource:               raw.imageSource     as 'ecr' | 'dockerhub',
      repositoryName:            raw.repositoryName,
      imageTag:                  raw.imageTag,
      healthCheckCommand:        raw.healthCheckCommand,
      healthCheckPath:           raw.healthCheckPath,
      s3BucketName:              raw.s3BucketName,
      bucketIsCdkManaged:        raw.bucketIsCdkManaged,
      subdomain:                 raw.subdomain,
    };
  }

  const RESERVED = new Set([
    'account','region','serviceName','domainName','hostedZoneId',
    'appPortNum','terminationWaitTimeMinutes','wantGrafana'
  ]);

  const envConfigs: Record<string, EnvConfig> = {};
  for (const key of Object.keys(baseConfig)) {
    if (!RESERVED.has(key)) {
      envConfigs[key] = extractEnv(key);
    }
  }

  return {
    account,
    region,
    serviceName,
    domainName,
    hostedZoneId,
    appPortNum,
    envConfigs,
    terminationWaitTimeMinutes,
    wantGrafana
  };
}