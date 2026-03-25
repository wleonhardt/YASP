import * as cdk from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import * as apprunner from "aws-cdk-lib/aws-apprunner";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cw_actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ORIGIN_SECRET_HEADER = "x-yasp-origin-secret";

// ---------------------------------------------------------------------------
// Stack props — non-secret configuration passed from bin/yasp.ts
// ---------------------------------------------------------------------------

export interface YaspStackProps extends cdk.StackProps {
  ecrRepoName?: string;
  serviceName?: string;
  autoDeploymentsEnabled?: boolean;
  createRepository?: boolean;
  retainLogBucket?: boolean;
  imageTag?: string;
  imageDigest?: string;
  alarmTopicArn?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveImageIdentifier(
  repoUri: string,
  tag?: string,
  digest?: string
): string {
  if (tag && digest) {
    throw new Error(
      "Provide exactly one of imageTag or imageDigest, not both."
    );
  }
  if (digest) {
    if (!digest.startsWith("sha256:")) {
      throw new Error(
        `imageDigest must start with "sha256:". Got: ${digest}`
      );
    }
    return `${repoUri}@${digest}`;
  }
  if (tag) {
    if (tag === "latest") {
      throw new Error(
        'Deploying with imageTag="latest" is not allowed. Use an explicit version tag or a digest.'
      );
    }
    return `${repoUri}:${tag}`;
  }
  throw new Error(
    "Missing image reference. Provide imageTag (e.g. -c imageTag=0.1.0) " +
      "or imageDigest (e.g. -c imageDigest=sha256:abc123...)."
  );
}

// ---------------------------------------------------------------------------
// Stack
// ---------------------------------------------------------------------------

export class YaspStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: YaspStackProps) {
    super(scope, id, props);

    const {
      ecrRepoName = "yasp",
      serviceName = "yasp",
      autoDeploymentsEnabled = false,
      createRepository = false,
      retainLogBucket = false,
      imageTag,
      imageDigest,
      alarmTopicArn,
    } = props;

    // -----------------------------------------------------------------------
    // CloudFormation parameters — secrets enter via NoEcho parameters,
    // not CDK context. This prevents leakage in CLI history, cdk.context.json,
    // and describe-stacks output.
    //
    // Pragmatic compromise: NoEcho reduces accidental exposure but does not
    // constitute secure secret storage. The Basic Auth credential is
    // ultimately embedded in the CloudFront Function source code, which is
    // visible in the CloudFront console. For a small internal tool this is
    // acceptable; for anything more sensitive, use a proper IdP.
    // -----------------------------------------------------------------------

    const basicAuthUsernameParam = new cdk.CfnParameter(
      this,
      "BasicAuthUsername",
      {
        type: "String",
        default: "yasp",
        description: "HTTP Basic Auth username for CloudFront access.",
      }
    );

    const basicAuthPasswordParam = new cdk.CfnParameter(
      this,
      "BasicAuthPassword",
      {
        type: "String",
        noEcho: true,
        description: "HTTP Basic Auth password for CloudFront access.",
        minLength: 8,
      }
    );

    const originSecretParam = new cdk.CfnParameter(this, "OriginSecret", {
      type: "String",
      noEcho: true,
      description:
        "Shared secret header value between CloudFront and App Runner WAF.",
      minLength: 16,
    });

    const basicAuthUsername = basicAuthUsernameParam.valueAsString;
    const basicAuthPassword = basicAuthPasswordParam.valueAsString;
    const originSecret = originSecretParam.valueAsString;

    // -----------------------------------------------------------------------
    // ECR repository
    // createRepository=true  → CDK creates and owns the repo (first-deploy friendly)
    // createRepository=false → import an existing repo by name (default)
    //
    // When creating: the repo will be empty on first deploy. You must push
    // an image to it BEFORE deploying the rest of the stack. Use a two-step
    // workflow: deploy once to create infra, push the image, then deploy
    // again — or push to the repo immediately after creation and before
    // App Runner tries to pull.
    // -----------------------------------------------------------------------

    const repo = createRepository
      ? new ecr.Repository(this, "YaspRepo", {
          repositoryName: ecrRepoName,
          removalPolicy: cdk.RemovalPolicy.RETAIN,
          lifecycleRules: [
            {
              description: "Keep last 10 images",
              maxImageCount: 10,
              rulePriority: 1,
            },
          ],
        })
      : ecr.Repository.fromRepositoryName(this, "YaspRepo", ecrRepoName);

    const imageIdentifier = resolveImageIdentifier(
      repo.repositoryUri,
      imageTag,
      imageDigest
    );

    // -----------------------------------------------------------------------
    // App Runner — ECR access role (least-privilege)
    // -----------------------------------------------------------------------

    const ecrAccessRole = new iam.Role(this, "AppRunnerEcrAccessRole", {
      assumedBy: new iam.ServicePrincipal("build.apprunner.amazonaws.com"),
      description: "Allows App Runner to pull images from ECR.",
    });
    repo.grantPull(ecrAccessRole);

    // No instance role — YASP does not call any AWS APIs at runtime.

    // -----------------------------------------------------------------------
    // App Runner service
    // -----------------------------------------------------------------------

    const service = new apprunner.CfnService(this, "YaspService", {
      serviceName,
      sourceConfiguration: {
        authenticationConfiguration: {
          accessRoleArn: ecrAccessRole.roleArn,
        },
        imageRepository: {
          imageIdentifier,
          imageRepositoryType: "ECR",
          imageConfiguration: {
            port: "3001",
          },
        },
        autoDeploymentsEnabled,
      },
      instanceConfiguration: {
        cpu: "0.25 vCPU",
        memory: "0.5 GB",
      },
      // TCP health check avoids any interaction with WAF. Port liveness is
      // sufficient — YASP binds to 3001 immediately on startup.
      healthCheckConfiguration: {
        protocol: "TCP",
        interval: 10,
        timeout: 5,
        healthyThreshold: 1,
        unhealthyThreshold: 5,
      },
    });

    const serviceUrl = service.attrServiceUrl;

    // -----------------------------------------------------------------------
    // Origin WAF (REGIONAL) — blocks direct App Runner access
    // Default: block. Only requests with the origin secret header pass.
    // -----------------------------------------------------------------------

    const originWaf = new wafv2.CfnWebACL(this, "OriginWaf", {
      scope: "REGIONAL",
      defaultAction: { block: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: "YaspOriginWaf",
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: "AllowOriginSecret",
          priority: 1,
          action: { allow: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "YaspOriginWafAllowSecret",
            sampledRequestsEnabled: true,
          },
          statement: {
            byteMatchStatement: {
              fieldToMatch: {
                singleHeader: { name: ORIGIN_SECRET_HEADER },
              },
              positionalConstraint: "EXACTLY",
              searchString: originSecret,
              textTransformations: [{ priority: 0, type: "NONE" }],
            },
          },
        },
      ],
    });

    // Explicit dependency: WAF must be fully created before association.
    // In rare cases WAF propagation may lag behind the association request.
    // If an association fails on first deploy, a simple redeploy resolves it.
    const originWafAssociation = new wafv2.CfnWebACLAssociation(
      this,
      "OriginWafAssociation",
      {
        resourceArn: service.attrServiceArn,
        webAclArn: originWaf.attrArn,
      }
    );
    originWafAssociation.addDependency(originWaf);
    originWafAssociation.node.addDependency(service);

    // -----------------------------------------------------------------------
    // CloudFront Function — Basic Auth at the edge
    //
    // Fn.base64 produces the base64-encoded credential string at deploy time
    // via CloudFormation intrinsics. The base64 output is always safe ASCII
    // (A-Za-z0-9+/=), so it can be embedded in the function code as a string
    // literal without escaping concerns — even if the original password
    // contains characters like " or \ that would break JS string syntax.
    // -----------------------------------------------------------------------

    const authFunction = new cloudfront.Function(this, "BasicAuthFunction", {
      code: cloudfront.FunctionCode.fromInline(
        cdk.Fn.sub(
          [
            "function handler(event) {",
            "  var request = event.request;",
            "  var headers = request.headers;",
            "  var expected = 'Basic ' + '${EncodedCredentials}';",
            "  if (!headers.authorization || headers.authorization.value !== expected) {",
            "    return {",
            "      statusCode: 401,",
            '      statusDescription: "Unauthorized",',
            "      headers: {",
            '        "www-authenticate": { value: \'Basic realm="YASP"\' },',
            '        "content-type": { value: "text/plain" },',
            "      },",
            '      body: "Unauthorized",',
            "    };",
            "  }",
            "  delete request.headers.authorization;",
            "  return request;",
            "}",
          ].join("\n"),
          {
            EncodedCredentials: cdk.Fn.base64(
              cdk.Fn.sub("${Username}:${Password}", {
                Username: basicAuthUsername,
                Password: basicAuthPassword,
              })
            ),
          }
        )
      ),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    // -----------------------------------------------------------------------
    // CloudFront access logs bucket
    // -----------------------------------------------------------------------

    const accessLogsBucket = new s3.Bucket(this, "CloudFrontAccessLogs", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: [
        { expiration: cdk.Duration.days(retainLogBucket ? 90 : 30) },
      ],
      removalPolicy: retainLogBucket
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !retainLogBucket,
      objectOwnership: s3.ObjectOwnership.OBJECT_WRITER,
    });

    // -----------------------------------------------------------------------
    // CloudFront WAF (CLOUDFRONT scope — must be us-east-1)
    // Viewer-facing protection: managed rules + rate limiting.
    // -----------------------------------------------------------------------

    const edgeWaf = new wafv2.CfnWebACL(this, "EdgeWaf", {
      scope: "CLOUDFRONT",
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: "YaspEdgeWaf",
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: "AWSManagedCommonRuleSet",
          priority: 1,
          overrideAction: { none: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "YaspEdgeWafCommonRules",
            sampledRequestsEnabled: true,
          },
          statement: {
            managedRuleGroupStatement: {
              vendorName: "AWS",
              name: "AWSManagedRulesCommonRuleSet",
            },
          },
        },
        // Rate limit: 2000 requests per 5 minutes per IP.
        // This is intentionally conservative. Adjust if users share a NAT/VPN
        // egress IP, during load testing, or if bot traffic patterns require
        // a different threshold.
        {
          name: "RateLimit",
          priority: 2,
          action: { block: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "YaspEdgeWafRateLimit",
            sampledRequestsEnabled: true,
          },
          statement: {
            rateBasedStatement: {
              limit: 2000,
              aggregateKeyType: "IP",
            },
          },
        },
      ],
    });

    // -----------------------------------------------------------------------
    // CloudFront distribution
    // -----------------------------------------------------------------------

    const distribution = new cloudfront.Distribution(this, "YaspCdn", {
      defaultBehavior: {
        origin: new origins.HttpOrigin(serviceUrl, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
          customHeaders: {
            [ORIGIN_SECRET_HEADER]: originSecret,
          },
        }),
        viewerProtocolPolicy:
          cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy:
          cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        functionAssociations: [
          {
            function: authFunction,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      webAclId: edgeWaf.attrArn,
      logBucket: accessLogsBucket,
      logFilePrefix: "yasp-cdn/",
    });

    // -----------------------------------------------------------------------
    // CloudWatch alarms
    // -----------------------------------------------------------------------

    const alarmTopic = alarmTopicArn
      ? sns.Topic.fromTopicArn(this, "AlarmTopic", alarmTopicArn)
      : undefined;

    const appRunner5xxAlarm = new cloudwatch.Alarm(
      this,
      "AppRunner5xxAlarm",
      {
        metric: new cloudwatch.Metric({
          namespace: "AWS/AppRunner",
          metricName: "5xxStatusResponses",
          dimensionsMap: { ServiceName: serviceName },
          statistic: "Sum",
          period: cdk.Duration.minutes(5),
        }),
        threshold: 10,
        evaluationPeriods: 2,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription: "YASP App Runner is returning elevated 5xx errors.",
      }
    );

    const cloudFront5xxAlarm = new cloudwatch.Alarm(
      this,
      "CloudFront5xxAlarm",
      {
        metric: new cloudwatch.Metric({
          namespace: "AWS/CloudFront",
          metricName: "5xxErrorRate",
          dimensionsMap: {
            DistributionId: distribution.distributionId,
            Region: "Global",
          },
          statistic: "Average",
          period: cdk.Duration.minutes(5),
        }),
        threshold: 5,
        evaluationPeriods: 2,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription: "YASP CloudFront 5xx error rate is elevated.",
      }
    );

    if (alarmTopic) {
      appRunner5xxAlarm.addAlarmAction(
        new cw_actions.SnsAction(alarmTopic)
      );
      cloudFront5xxAlarm.addAlarmAction(
        new cw_actions.SnsAction(alarmTopic)
      );
    }

    // -----------------------------------------------------------------------
    // Stack outputs
    // -----------------------------------------------------------------------

    new cdk.CfnOutput(this, "EcrRepositoryUri", {
      value: repo.repositoryUri,
      description: "ECR repository URI for pushing YASP images.",
    });

    new cdk.CfnOutput(this, "DeployedImageReference", {
      value: imageIdentifier,
      description: "Exact image reference deployed to App Runner.",
    });

    new cdk.CfnOutput(this, "AppRunnerServiceUrl", {
      value: cdk.Fn.sub("https://${ServiceUrl}", {
        ServiceUrl: serviceUrl,
      }),
      description:
        "App Runner service URL (protected by WAF — do not use directly).",
    });

    new cdk.CfnOutput(this, "AppRunnerServiceArn", {
      value: service.attrServiceArn,
      description: "App Runner service ARN (for manual redeployment).",
    });

    new cdk.CfnOutput(this, "CloudFrontUrl", {
      value: cdk.Fn.sub("https://${Domain}", {
        Domain: distribution.distributionDomainName,
      }),
      description: "CloudFront URL — primary entry point for YASP.",
    });

    new cdk.CfnOutput(this, "OriginWafArn", {
      value: originWaf.attrArn,
      description: "WAF web ACL ARN protecting the App Runner origin.",
    });

    new cdk.CfnOutput(this, "EdgeWafArn", {
      value: edgeWaf.attrArn,
      description:
        "WAF web ACL ARN protecting the CloudFront distribution.",
    });

    new cdk.CfnOutput(this, "AccessLogsBucket", {
      value: accessLogsBucket.bucketName,
      description: "S3 bucket for CloudFront access logs.",
    });
  }
}
