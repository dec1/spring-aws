import { loadAppConfig, ResolvedAppConfig } from '../config/app-config-reader';
import * as fs from 'fs';

jest.mock('fs');

describe('loadAppConfig', () => {

  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv }; // Reset env for each test
  });

  afterAll(() => {
    process.env = originalEnv; // Restore original env after all tests
  });

  test('should prioritize CDK context (context.myAppConfig)', () => {
    const context = {
      myAppConfig: {
        account: '111111111111',
        region: 'us-east-1',
        serviceName: 'context-service',
        domainName: 'context.example.com',
        devSubdomain: 'dev-context',
        releaseSubdomain: 'release-context',
        terminationWaitTimeMinutes: 10,
        repositoryNameDev: 'repo-dev-context',
        repositoryNameRelease: 'repo-release-context',
        imageTagDev: 'tag-dev-context',
        imageTagRelease: 'tag-release-context',
        imageSourceDev: 'dockerhub',
        imageSourceRelease: 'dockerhub',
        s3BucketName: 'bucket-context',
        hostedZoneId: 'Z1111111111111CONTEXT', // Added hostedZoneId
      }
    };

    const config = loadAppConfig(context);

    expect(config.account).toBe('111111111111');
    expect(config.region).toBe('us-east-1');
    expect(config.serviceName).toBe('context-service');
    expect(config.domainName).toBe('context.example.com');
    expect(config.hostedZoneId).toBe('Z1111111111111CONTEXT'); // Assert hostedZoneId
  });

  test('should load config from file if context.myAppConfig is missing', () => {
    // Mock fs.readFileSync to return JSON string for file config
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({
      account: '222222222222',
      region: 'us-west-2',
      serviceName: 'file-service',
      domainName: 'file.example.com',
      devSubdomain: 'dev-file',
      releaseSubdomain: 'release-file',
      terminationWaitTimeMinutes: 7,
      repositoryNameDev: 'repo-dev-file',
      repositoryNameRelease: 'repo-release-file',
      imageTagDev: 'tag-dev-file',
      imageTagRelease: 'tag-release-file',
      imageSourceDev: 'ecr',
      imageSourceRelease: 'ecr',
      s3BucketName: 'bucket-file',
      hostedZoneId: 'Z2222222222222FILE', // Added hostedZoneId
    }));

    const context = {}; // no myAppConfig

    const config = loadAppConfig(context);

    expect(config.serviceName).toBe('file-service');
    expect(config.domainName).toBe('file.example.com');
    expect(config.hostedZoneId).toBe('Z2222222222222FILE'); // Assert hostedZoneId
  });

  test('should fallback to environment variables if no context or file', () => {
    const context = {}; // no myAppConfig

    // Remove file read mock to simulate missing file
    (fs.readFileSync as jest.Mock).mockImplementation(() => {
      throw Object.assign(new Error('File not found'), { code: 'ENOENT' });
    });

    // Set environment variables for config
    process.env.CDK_DEFAULT_ACCOUNT = '333333333333';
    process.env.CDK_DEFAULT_REGION = 'ap-southeast-1';
    process.env.CDK_SERVICE_NAME = 'env-service';
    process.env.CDK_DOMAIN_NAME = 'env.example.com';
    process.env.CDK_S3_BUCKET_NAME = 'bucket-env';
    process.env.CDK_TERMINATION_WAIT_TIME_MINUTES = '12';
    process.env.CDK_HOSTED_ZONE_ID = 'Z3333333333333ENV'; // Added hostedZoneId env var

    const config = loadAppConfig(context);

    expect(config.account).toBe('333333333333');
    expect(config.region).toBe('ap-southeast-1');
    expect(config.serviceName).toBe('env-service');
    expect(config.domainName).toBe('env.example.com');
    expect(config.terminationWaitTimeMinutes).toBe(12);
    expect(config.hostedZoneId).toBe('Z3333333333333ENV'); // Assert hostedZoneId
  });

test('should throw clear error if required config is missing', () => {
    const context = {}; // no myAppConfig

    // Simulate missing config file
    (fs.readFileSync as jest.Mock).mockImplementation(() => {
      throw Object.assign(new Error('File not found'), { code: 'ENOENT' });
    });

    // Clear all relevant environment variables
    delete process.env.CDK_DEFAULT_ACCOUNT;
    delete process.env.CDK_DEFAULT_REGION;
    delete process.env.CDK_SERVICE_NAME;
    delete process.env.CDK_DOMAIN_NAME;
    delete process.env.CDK_HOSTED_ZONE_ID;
    delete process.env.CDK_TERMINATION_WAIT_TIME_MINUTES;
    delete process.env.CDK_S3_BUCKET_NAME;

    expect(() => loadAppConfig(context)).toThrow('CDK_DEFAULT_ACCOUNT is required');
  });

});