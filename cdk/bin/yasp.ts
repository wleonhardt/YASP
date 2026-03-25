#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { YaspStack } from "../lib/yasp-stack";

const app = new cdk.App();

// Non-secret config from context with sensible defaults.
const ecrRepoName = app.node.tryGetContext("ecrRepoName") ?? "yasp";
const serviceName = app.node.tryGetContext("serviceName") ?? "yasp";
const autoDeploymentsEnabled =
  app.node.tryGetContext("autoDeploymentsEnabled") === "true";
const createRepository =
  app.node.tryGetContext("createRepository") === "true";
const retainLogBucket =
  app.node.tryGetContext("retainLogBucket") === "true";

// Image reference from context — exactly one of imageTag or imageDigest is required.
const imageTag = app.node.tryGetContext("imageTag") as string | undefined;
const imageDigest = app.node.tryGetContext("imageDigest") as string | undefined;

// Optional SNS topic ARN for alarm notifications.
const alarmTopicArn = app.node.tryGetContext("alarmTopicArn") as
  | string
  | undefined;

new YaspStack(app, "YaspStack", {
  ecrRepoName,
  serviceName,
  autoDeploymentsEnabled,
  createRepository,
  retainLogBucket,
  imageTag,
  imageDigest,
  alarmTopicArn,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
