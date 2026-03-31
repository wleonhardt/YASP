import * as cdk from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cw_actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sns from "aws-cdk-lib/aws-sns";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import * as cr from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";
import { buildEc2OriginUserData } from "./ec2-origin-bootstrap";

const ORIGIN_SECRET_HEADER = "x-yasp-origin-secret";
const CLOUDFRONT_PREFIX_LIST_NAME = "com.amazonaws.global.cloudfront.origin-facing";
const DEFAULT_INSTANCE_TYPE = "t3.micro";
const CONTAINER_PORT = 3001;
const ORIGIN_PORT = 80;
const CONTAINER_NAME = "yasp";
const ORIGIN_LOG_RETENTION = logs.RetentionDays.ONE_MONTH;

export interface YaspStackProps extends cdk.StackProps {
  ecrRepoName?: string;
  serviceName?: string;
  createRepository?: boolean;
  retainLogBucket?: boolean;
  enableBasicAuth?: boolean;
  imageTag?: string;
  imageDigest?: string;
  alarmTopicArn?: string;
  instanceType?: string;
  domainName?: string;
  certificateArn?: string;
}

function resolveImageIdentifier(repoUri: string, tag?: string, digest?: string): string {
  if (tag && digest) {
    throw new Error("Provide exactly one of imageTag or imageDigest, not both.");
  }

  if (digest) {
    if (!/^sha256:[A-Fa-f0-9]{64}$/.test(digest)) {
      throw new Error(`imageDigest must match sha256:<64 hex chars>. Got: ${digest}`);
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

function lookupCloudFrontPrefixListId(scope: Construct): cr.AwsCustomResource {
  return new cr.AwsCustomResource(scope, "CloudFrontOriginPrefixListLookup", {
    onCreate: {
      service: "EC2",
      action: "describeManagedPrefixLists",
      parameters: {
        Filters: [
          {
            Name: "prefix-list-name",
            Values: [CLOUDFRONT_PREFIX_LIST_NAME],
          },
        ],
      },
      physicalResourceId: cr.PhysicalResourceId.of(`cloudfront-origin-prefix-list-${cdk.Aws.REGION}`),
    },
    onUpdate: {
      service: "EC2",
      action: "describeManagedPrefixLists",
      parameters: {
        Filters: [
          {
            Name: "prefix-list-name",
            Values: [CLOUDFRONT_PREFIX_LIST_NAME],
          },
        ],
      },
      physicalResourceId: cr.PhysicalResourceId.of(`cloudfront-origin-prefix-list-${cdk.Aws.REGION}`),
    },
    policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
      resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
    }),
    installLatestAwsSdk: false,
  });
}

export class YaspStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: YaspStackProps) {
    super(scope, id, props);

    const {
      ecrRepoName = "yasp",
      serviceName = "yasp",
      createRepository = false,
      retainLogBucket = false,
      enableBasicAuth = true,
      imageTag,
      imageDigest,
      alarmTopicArn,
      instanceType = DEFAULT_INSTANCE_TYPE,
      domainName,
      certificateArn,
    } = props;

    let basicAuthUsername: string | undefined;
    let basicAuthPassword: string | undefined;

    if (enableBasicAuth) {
      const basicAuthUsernameParam = new cdk.CfnParameter(this, "BasicAuthUsername", {
        type: "String",
        default: "yasp",
        description: "HTTP Basic Auth username for CloudFront access.",
      });

      const basicAuthPasswordParam = new cdk.CfnParameter(this, "BasicAuthPassword", {
        type: "String",
        noEcho: true,
        description: "HTTP Basic Auth password for CloudFront access.",
        minLength: 8,
      });

      basicAuthUsername = basicAuthUsernameParam.valueAsString;
      basicAuthPassword = basicAuthPasswordParam.valueAsString;
    }

    const originSecretParam = new cdk.CfnParameter(this, "OriginSecret", {
      type: "String",
      noEcho: true,
      description: "Hex secret header value shared between CloudFront and the EC2 origin.",
      minLength: 16,
      allowedPattern: "[A-Fa-f0-9]{16,}",
      constraintDescription: "OriginSecret must be at least 16 hexadecimal characters.",
    });

    const originSecret = originSecretParam.valueAsString;

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

    const imageIdentifier = resolveImageIdentifier(repo.repositoryUri, imageTag, imageDigest);

    const alarmTopic = alarmTopicArn ? sns.Topic.fromTopicArn(this, "AlarmTopic", alarmTopicArn) : undefined;

    const registryUri = cdk.Fn.sub("${AWS::AccountId}.dkr.ecr.${AWS::Region}.amazonaws.com");
    const originLogGroupName = `/${serviceName}/origin`;

    const vpc = new ec2.Vpc(this, "YaspVpc", {
      maxAzs: 1,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
    });

    const originSecurityGroup = new ec2.SecurityGroup(this, "OriginSecurityGroup", {
      vpc,
      allowAllOutbound: true,
      description:
        "YASP EC2 origin security group. Inbound traffic is limited to CloudFront origin-facing infrastructure.",
    });

    const cloudFrontPrefixListLookup = lookupCloudFrontPrefixListId(this);
    const cloudFrontPrefixListId = cloudFrontPrefixListLookup.getResponseField("PrefixLists.0.PrefixListId");

    const allowCloudFrontIngress = new ec2.CfnSecurityGroupIngress(this, "AllowCloudFrontIngress", {
      groupId: originSecurityGroup.securityGroupId,
      ipProtocol: "tcp",
      fromPort: ORIGIN_PORT,
      toPort: ORIGIN_PORT,
      sourcePrefixListId: cloudFrontPrefixListId,
      description: "Allow HTTP origin traffic only from CloudFront origin-facing IP ranges.",
    });
    allowCloudFrontIngress.node.addDependency(cloudFrontPrefixListLookup);

    const instanceRole = new iam.Role(this, "YaspInstanceRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      description: "Allows the YASP EC2 origin to pull from ECR and be managed through SSM.",
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore")],
    });
    repo.grantPull(instanceRole);

    const originLogGroup = new logs.LogGroup(this, "OriginLogGroup", {
      logGroupName: originLogGroupName,
      retention: ORIGIN_LOG_RETENTION,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const originLogStreamArn = `${originLogGroup.logGroupArn}:log-stream:*`;
    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["logs:CreateLogStream", "logs:DescribeLogStreams", "logs:PutLogEvents"],
        resources: [originLogGroup.logGroupArn, originLogStreamArn],
      })
    );

    const userData = buildEc2OriginUserData({
      awsRegion: cdk.Stack.of(this).region,
      imageIdentifier,
      originSecret,
      originSecretHeaderName: ORIGIN_SECRET_HEADER,
      logGroupName: originLogGroupName,
      registryUri,
      containerPort: CONTAINER_PORT,
      originPort: ORIGIN_PORT,
      containerName: CONTAINER_NAME,
    });

    const instance = new ec2.Instance(this, "YaspOriginInstance", {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      associatePublicIpAddress: true,
      securityGroup: originSecurityGroup,
      role: instanceRole,
      instanceType: new ec2.InstanceType(instanceType),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      requireImdsv2: true,
      userData,
      userDataCausesReplacement: true,
      blockDevices: [
        {
          deviceName: "/dev/xvda",
          volume: ec2.BlockDeviceVolume.ebs(16, {
            encrypted: true,
            volumeType: ec2.EbsDeviceVolumeType.GP3,
          }),
        },
      ],
    });
    cdk.Tags.of(instance).add("Name", serviceName);
    instance.node.addDependency(allowCloudFrontIngress);
    instance.node.addDependency(originLogGroup);

    let authFunction: cloudfront.Function | undefined;

    if (enableBasicAuth && basicAuthUsername && basicAuthPassword) {
      // Build the CloudFront Function code using Fn::Join instead of Fn::Sub.
      // Fn::Sub escapes special characters like "!" → "\!" which corrupts
      // credential matching. Fn::Join concatenates without escaping.
      const b64Helper = [
        "var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';",
        "function b64(s) {",
        "  var r = '', i = 0, len = s.length;",
        "  while (i < len) {",
        "    var a = s.charCodeAt(i++);",
        "    var b = i < len ? s.charCodeAt(i++) : -1;",
        "    var c = i < len ? s.charCodeAt(i++) : -1;",
        "    var n = (a << 16) | ((b >= 0 ? b : 0) << 8) | (c >= 0 ? c : 0);",
        "    r += B64[(n >> 18) & 63];",
        "    r += B64[(n >> 12) & 63];",
        "    r += b >= 0 ? B64[(n >> 6) & 63] : '=';",
        "    r += c >= 0 ? B64[n & 63] : '=';",
        "  }",
        "  return r;",
        "}",
      ].join("\n");

      const authFunctionCode = cdk.Fn.join("", [
        b64Helper,
        "\nfunction handler(event) {\n",
        "  var request = event.request;\n",
        "  var headers = request.headers;\n",
        "  var expected = 'Basic ' + b64('",
        basicAuthUsername,
        "' + ':' + '",
        basicAuthPassword,
        "');\n",
        "  if (!headers.authorization || headers.authorization.value !== expected) {\n",
        "    return {\n",
        "      statusCode: 401,\n",
        '      statusDescription: "Unauthorized",\n',
        "      headers: {\n",
        '        "www-authenticate": { value: \'Basic realm="YASP"\' },\n',
        '        "content-type": { value: "text/plain" },\n',
        "      },\n",
        '      body: "Unauthorized",\n',
        "    };\n",
        "  }\n",
        "  delete request.headers.authorization;\n",
        "  return request;\n",
        "}",
      ]);

      authFunction = new cloudfront.Function(this, "BasicAuthFunction", {
        code: cloudfront.FunctionCode.fromInline(authFunctionCode),
        runtime: cloudfront.FunctionRuntime.JS_2_0,
        comment: "YASP Basic Auth - runtime base64 encoding",
      });
    }

    const accessLogsBucket = new s3.Bucket(this, "CloudFrontAccessLogs", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: [{ expiration: cdk.Duration.days(retainLogBucket ? 90 : 30) }],
      removalPolicy: retainLogBucket ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !retainLogBucket,
      objectOwnership: s3.ObjectOwnership.OBJECT_WRITER,
    });

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

    const certificate =
      certificateArn && domainName
        ? acm.Certificate.fromCertificateArn(this, "DomainCertificate", certificateArn)
        : undefined;

    const distribution = new cloudfront.Distribution(this, "YaspCdn", {
      ...(domainName ? { domainNames: [domainName] } : {}),
      ...(certificate ? { certificate } : {}),
      defaultBehavior: {
        origin: new origins.HttpOrigin(instance.instancePublicDnsName, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
          httpPort: ORIGIN_PORT,
          customHeaders: {
            [ORIGIN_SECRET_HEADER]: originSecret,
          },
          readTimeout: cdk.Duration.seconds(60),
          keepaliveTimeout: cdk.Duration.seconds(60),
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        ...(authFunction
          ? {
              functionAssociations: [
                {
                  function: authFunction,
                  eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
                },
              ],
            }
          : {}),
      },
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      webAclId: edgeWaf.attrArn,
      logBucket: accessLogsBucket,
      logFilePrefix: `${serviceName}-cdn/`,
    });

    const cloudFront5xxAlarm = new cloudwatch.Alarm(this, "CloudFront5xxAlarm", {
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
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "YASP CloudFront 5xx error rate is elevated.",
    });

    const ec2StatusCheckAlarm = new cloudwatch.Alarm(this, "Ec2StatusCheckFailedAlarm", {
      metric: new cloudwatch.Metric({
        namespace: "AWS/EC2",
        metricName: "StatusCheckFailed",
        dimensionsMap: {
          InstanceId: instance.instanceId,
        },
        statistic: "Maximum",
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "The YASP EC2 origin has failed an EC2 status check.",
    });

    if (alarmTopic) {
      const snsAction = new cw_actions.SnsAction(alarmTopic);
      cloudFront5xxAlarm.addAlarmAction(snsAction);
      ec2StatusCheckAlarm.addAlarmAction(snsAction);
    }

    new cdk.CfnOutput(this, "CloudFrontUrl", {
      value: cdk.Fn.sub("https://${Domain}", {
        Domain: distribution.distributionDomainName,
      }),
      description: "CloudFront URL — primary entry point for YASP.",
    });

    new cdk.CfnOutput(this, "Ec2PublicDnsName", {
      value: instance.instancePublicDnsName,
      description:
        "Public DNS name of the EC2 origin. Direct access is intended to be blocked unless the origin secret is present.",
    });

    new cdk.CfnOutput(this, "Ec2PublicIp", {
      value: instance.instancePublicIp,
      description: "Public IP address of the EC2 origin instance.",
    });

    new cdk.CfnOutput(this, "InstanceId", {
      value: instance.instanceId,
      description: "EC2 instance ID for the YASP origin.",
    });

    new cdk.CfnOutput(this, "SsmStartSessionCommand", {
      value: cdk.Fn.sub("aws ssm start-session --target ${InstanceId}", {
        InstanceId: instance.instanceId,
      }),
      description: "Command to start an SSM session to the origin instance.",
    });

    new cdk.CfnOutput(this, "EcrRepositoryUri", {
      value: repo.repositoryUri,
      description: "ECR repository URI for pushing YASP images.",
    });

    new cdk.CfnOutput(this, "DeployedImageReference", {
      value: imageIdentifier,
      description: "Exact image reference deployed to the EC2 origin.",
    });

    new cdk.CfnOutput(this, "EdgeWafArn", {
      value: edgeWaf.attrArn,
      description: "WAF web ACL ARN protecting the CloudFront distribution.",
    });

    new cdk.CfnOutput(this, "AccessLogsBucket", {
      value: accessLogsBucket.bucketName,
      description: "S3 bucket for CloudFront access logs.",
    });

    new cdk.CfnOutput(this, "OriginLogGroupName", {
      value: originLogGroupName,
      description: "CloudWatch Logs group containing YASP origin container logs.",
    });
  }
}
