# YASP — AWS Deployment (CDK)

Optional infrastructure-as-code for deploying YASP to AWS behind CloudFront on a single EC2 instance.

> YASP runs fine as a plain Docker container. This stack adds CloudFront, WAF, and Basic Auth for lightweight internal-tool hosting.

## Architecture

```
                                    ┌─────────────────┐
                                    │  Edge WAF       │
                                    │  (CLOUDFRONT)   │
                                    │  • Managed rules│
                                    │  • Rate limit   │
                                    └────────┬────────┘
                                             │
┌──────────┐     Basic Auth      ┌───────────▼───┐   Origin Secret   ┌─────────────────────┐
│ Browser  │ ──────────────────▶ │  CloudFront    │ ────────────────▶ │ EC2 + nginx + Docker│
└──────────┘                     │ + CF Function  │   (custom header) │ YASP container:3001 │
                                 └───────────────┘                    └─────────────────────┘
```

1. CloudFront WAF evaluates managed rules and rate limits
2. A CloudFront Function enforces HTTP Basic Auth
3. CloudFront adds `x-yasp-origin-secret` and forwards to EC2
4. EC2 security group allows inbound only from CloudFront IP ranges
5. nginx validates the origin secret and proxies to the YASP container
6. WebSocket upgrades flow through the same path (CloudFront forwards upgrade headers, nginx sets required proxy headers)

**Why EC2?** YASP keeps room state in process memory and uses WebSockets. That requires a long-running process with stable connections — a single EC2 instance is the simplest shape without introducing ECS, Redis, or orchestration.

## Security Model

This stack is appropriate for a small internal tool, not a high-assurance security boundary.

- Basic Auth at the CloudFront edge
- Origin secret header checked by nginx before requests reach the app
- EC2 allows inbound only from the CloudFront origin-facing prefix list on port 80
- WAF provides managed rule protection and rate limiting
- Secrets passed as CloudFormation `NoEcho` parameters

**Tradeoffs:** The Basic Auth credential is visible in the CloudFront Function source in AWS. The origin secret is present in the synthesized template and on the instance. This is pragmatic deterrence — if the threat model grows, move to a real IdP.

## Prerequisites

- AWS account with permissions for EC2, CloudFront, WAF, ECR, IAM, S3, SNS, CloudWatch, SSM
- AWS CLI v2 configured, CDK bootstrapped in `us-east-1`
- Node.js 20+, npm, Docker
- Must deploy in `us-east-1` (CloudFront WAF requires `CLOUDFRONT` scope)

## Setup

### 1. Install and bootstrap

```bash
cd cdk
npm install
npx cdk bootstrap aws://<ACCOUNT_ID>/us-east-1
```

### 2. ECR repository

Either let CDK create one with `-c createRepository=true`, or import an existing repo by name (default: `yasp`).

### 3. Build and push the image

The EC2 origin runs x86_64. On Apple Silicon, add `--platform linux/amd64`.

```bash
docker build --platform linux/amd64 -t yasp:0.1.0 ..

aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

docker tag yasp:0.1.0 <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/yasp:0.1.0
docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/yasp:0.1.0
```

### 4. Generate secrets

```bash
BASIC_AUTH_PASSWORD=$(openssl rand -base64 24)
ORIGIN_SECRET=$(openssl rand -hex 32)
```

### 5. Deploy

```bash
npx cdk deploy \
  -c imageTag=0.1.0 \
  -c instanceType=t3.micro \
  --parameters BasicAuthUsername=yasp \
  --parameters BasicAuthPassword="$BASIC_AUTH_PASSWORD" \
  --parameters OriginSecret="$ORIGIN_SECRET"
```

For digest pinning, use `-c imageDigest=<digest>` instead of `-c imageTag`.

## Configuration

### CloudFormation parameters

| Parameter           | Required | Default | Description |
| ------------------- | -------- | ------- | ----------- |
| `BasicAuthUsername` | No       | `yasp`  | HTTP Basic Auth username |
| `BasicAuthPassword` | Yes      | —       | HTTP Basic Auth password |
| `OriginSecret`      | Yes      | —       | Hex secret validated by nginx |

### CDK context

| Context Key        | Required | Default     | Description |
| ------------------ | -------- | ----------- | ----------- |
| `imageTag`         | *        | —           | Image tag to deploy |
| `imageDigest`      | *        | —           | Image digest to deploy |
| `ecrRepoName`      | No       | `yasp`      | ECR repository name |
| `serviceName`      | No       | `yasp`      | Resource naming prefix |
| `createRepository` | No       | `false`     | Create ECR repository in CDK |
| `retainLogBucket`  | No       | `false`     | Retain CloudFront logs on teardown |
| `alarmTopicArn`    | No       | —           | SNS topic ARN for alarm notifications |
| `instanceType`     | No       | `t3.micro`  | EC2 instance type |

\* Exactly one of `imageTag` or `imageDigest` is required. `imageTag=latest` is rejected.

### Stack outputs

| Output | Description |
| ------ | ----------- |
| `CloudFrontUrl` | Primary authenticated entry point |
| `InstanceId` | EC2 instance ID |
| `OriginLogGroupName` | CloudWatch Logs group for origin container logs |
| `SsmStartSessionCommand` | Ready-to-run SSM session command |
| `EcrRepositoryUri` | ECR repository URI |
| `DeployedImageReference` | Exact tag or digest deployed |
| `EdgeWafArn` | CloudFront WAF ARN |
| `AccessLogsBucket` | CloudFront access logs bucket |

## Operations

### SSM access

SSM Session Manager is the management path. Port 22 is not opened.

```bash
aws ssm start-session --target <INSTANCE_ID>

# On the instance:
sudo systemctl status yasp
sudo systemctl restart yasp
sudo docker logs yasp --tail 200
```

### CloudWatch Logs

The EC2 origin ships container stdout/stderr to CloudWatch Logs through Docker's `awslogs` driver.

Default log group:

```bash
/yasp/origin
```

Tail recent origin logs:

```bash
aws logs tail /yasp/origin --since 1h --follow --region us-east-1
```

Useful CloudWatch Logs Insights filters:

```text
fields @timestamp, event, message, stack
| filter event in ["uncaughtException", "unhandledRejection", "client_error"]
| sort @timestamp desc
```

### Deploy a new image

Build, tag, push, then re-run `cdk deploy` with the new `-c imageTag=<version>`. Changing the image reference replaces the instance — this is intentional for reproducibility but disrupts active rooms.

### Rotate credentials

Re-run `cdk deploy` with new `--parameters BasicAuthPassword` or `--parameters OriginSecret` values.

### Alarms

The stack creates `CloudFront5xxAlarm` and `Ec2StatusCheckFailedAlarm`. Both publish to the SNS topic if `-c alarmTopicArn` is provided.

### Access logs

CloudFront logs go to an S3 bucket with public access blocked, encryption, SSL-only access, and 30-day expiration (90-day with `-c retainLogBucket=true`).

## Known Tradeoffs

- Single instance — no HA, no rolling deploys, no horizontal scale
- Instance replacement disrupts active in-memory rooms
- CloudFront → EC2 is HTTP (not HTTPS) to keep the stack simple
- CloudFront has a 60-second origin read timeout; idle WebSockets may be dropped at that interval (Socket.IO reconnects automatically)
- CloudFront WAF adds a real monthly baseline cost

## Tear Down

```bash
npx cdk destroy
```

If `createRepository=true` was used, the ECR repository is retained and must be deleted manually:

```bash
aws ecr delete-repository --repository-name yasp --force --region us-east-1
```

Do not commit `cdk.out/` — it can contain synthesized templates with resolved secrets.
