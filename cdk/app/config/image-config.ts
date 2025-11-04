// config/image-config.ts

import * as cdk from 'aws-cdk-lib';
import { AppStackProps } from '../lib/app-stack';

/**
 * Holds container-image and health-check config, with optional overrides
 * from app-config.json.
 */
export class ImageConfig {
  constructor(
    private imageSource: 'dockerhub' | 'ecr',
    private repositoryName: string,
    private tag: string = 'latest',
    private appPortNum: number,
    private healthCheckCommandOverride?: string[],  
    private healthCheckPathOverride?: string       
  ) {}

  public applyConfig(props: Partial<AppStackProps>): void {
    props.imageSource = this.imageSource;
    props.repositoryName = this.repositoryName;
    props.tag = this.tag;
    props.appPortNum = this.appPortNum;
    props.healthChecks = this.getHealthChecks();
  }

  protected getHealthChecks(): AppStackProps['healthChecks'] {
    // allow path override, otherwise default to "/api/hello"
    const HEALTH_CHECK_PATH = this.healthCheckPathOverride ?? "/api/hello";

    const TIMEOUT = 5;    // max seconds to wait for result of health check
    const INTERVAL = 7;   // how often (in seconds) to run health check

    const START_PERIOD_SHORT = 60;  // seconds, e.g. dockerhub
    const START_PERIOD_LONG  = 300; // seconds, e.g. ecr

    // base command
    // wget’s “--spider” mode fetches headers only; if the URL is not reachable, it returns non‐zero.
    const commandOptions = `wget --quiet --tries=1 --spider`;  
    const defaultUrl = `http://localhost:${this.appPortNum}${HEALTH_CHECK_PATH}`;
    const defaultCommand = ['CMD-SHELL', `${commandOptions} ${defaultUrl} || exit 1`];

    // pick override or default
    const containerHealthCheckCommand = this.healthCheckCommandOverride ?? defaultCommand;

    // start-period based on image source
    const containerStartPeriod = (this.imageSource === 'ecr')
      ? cdk.Duration.seconds(START_PERIOD_LONG)
      : cdk.Duration.seconds(START_PERIOD_SHORT);

    return {
      // Called by container on container itself
      containerHealthCheckCommand,
      containerHealthCheckRetries: 2,
      containerHealthCheckStartPeriod: containerStartPeriod,
      containerHealthCheckTimeout: cdk.Duration.seconds(TIMEOUT),
      containerHealthCheckInterval: cdk.Duration.seconds(INTERVAL),

      // Called by ALB on containers (targetrGroup)
      targetGroupHealthCheckPath: HEALTH_CHECK_PATH,
      targetGroupHealthCheckTimeout: cdk.Duration.seconds(TIMEOUT),
      targetGroupHealthCheckInterval: cdk.Duration.seconds(INTERVAL),
      targetGroupHealthyThresholdCount: 5,
    };
  }
}
