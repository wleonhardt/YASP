# YASP — AWS Deployment (CDK)

Optional infrastructure-as-code for deploying YASP to AWS with a single EC2 origin behind CloudFront.

> This module is optional. YASP still runs fine as a plain Docker container. The CDK stack adds a small AWS hosting footprint with pragmatic access controls for an internal tool.

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

Traffic flow:

1. Viewer reaches the CloudFront URL.
2. CloudFront WAF evaluates managed rules and rate limits.
3. A CloudFront Function enforces HTTP Basic Auth.
4. CloudFront forwards the request to the EC2 origin and adds `x-yasp-origin-secret`.
5. The EC2 security group allows inbound traffic only from CloudFront origin-facing IP ranges.
6. nginx validates the origin secret and proxies to the local YASP container.
7. Socket.IO and WebSocket upgrade traffic flow through the same CloudFront-to-nginx path.

### Why EC2 instead of Lambda or App Runner?

YASP keeps live room state in process memory and uses Socket.IO / WebSockets. That requires a long-running process with stable connections. A single EC2 instance is the simplest AWS-hosted shape that preserves that behavior without introducing ECS, Redis, or a larger orchestration layer.

## Security Model

This stack is intentionally lightweight. It is appropriate for a small internal tool, not a high-assurance security boundary.

- Basic Auth is enforced at the CloudFront edge.
- The origin secret header (`x-yasp-origin-secret`) is added by CloudFront and checked by nginx before requests reach the app.
- The EC2 origin only allows inbound traffic from the AWS-managed CloudFront origin-facing prefix list on port 80.
- CloudFront WAF provides managed rule protection and a conservative rate limit.
- Secrets are passed as CloudFormation parameters with `NoEcho`, which reduces accidental exposure but does not make them invisible everywhere.

Important tradeoffs:

- The Basic Auth credential is still visible in the CloudFront Function source code in AWS.
- The origin secret is still present in the synthesized CloudFormation template and on the instance.
- This is a pragmatic deterrence layer, not enterprise authentication. If the threat model grows, move to a real IdP.

## WebSocket Compatibility

CloudFront forwards the viewer headers needed for WebSocket upgrades, and nginx is configured with the required `Upgrade` / `Connection` proxy headers. Socket.IO can negotiate WebSockets through CloudFront and fall back to HTTP long-polling if needed.

## Prerequisites

- AWS account with permissions for EC2, CloudFront, WAF, ECR, IAM, S3, SNS, CloudWatch, and SSM
- AWS CLI v2 configured
- Node.js 20+ and npm
- Docker
- CDK bootstrapped in the target account
- Deploy in `us-east-1` because the CloudFront WAF uses scope `CLOUDFRONT`

## Setup

### 1. Install CDK dependencies

```bash
cd cdk
npm install
```

### 2. Bootstrap CDK

```bash
npx cdk bootstrap aws://<ACCOUNT_ID>/us-east-1
```

### 3. ECR repository

Choose one:

- `-c createRepository=true`: CDK creates a private ECR repository named `yasp`, keeps the last 10 images, and retains the repo on stack deletion.
- Default: import an existing repository by name.

If you create the repository with CDK for the first time, deploy once to create the repo, then push the image. The EC2 service will keep retrying image pulls until the image exists, or you can restart it manually via SSM after pushing.

### 4. Build and push an explicit image

Use an explicit version or commit SHA. Do not deploy `latest`.

The EC2 origin runs on x86_64. If you are building on Apple Silicon (M1/M2/M3), you must specify the platform:

```bash
# From the cdk/ directory (Dockerfile is at the project root)
docker build --platform linux/amd64 -t yasp:0.1.0 ..

aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

docker tag yasp:0.1.0 <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/yasp:0.1.0
docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/yasp:0.1.0
```

### 5. Generate secrets

`OriginSecret` is validated as hexadecimal text, so generate it that way.

```bash
BASIC_AUTH_PASSWORD=$(openssl rand -base64 24)
ORIGIN_SECRET=$(openssl rand -hex 32)
echo "Password: $BASIC_AUTH_PASSWORD"
echo "Origin secret: $ORIGIN_SECRET"
```

### 6. Deploy

```bash
npx cdk deploy \
  -c imageTag=0.1.0 \
  -c instanceType=t3.micro \
  --parameters BasicAuthUsername=yasp \
  --parameters BasicAuthPassword="$BASIC_AUTH_PASSWORD" \
  --parameters OriginSecret="$ORIGIN_SECRET"
```

For digest pinning:

```bash
DIGEST=$(aws ecr describe-images \
  --repository-name yasp \
  --image-ids imageTag=0.1.0 \
  --query 'imageDetails[0].imageDigest' \
  --output text \
  --region us-east-1)

npx cdk deploy \
  -c imageDigest=$DIGEST \
  -c instanceType=t3.micro \
  --parameters BasicAuthUsername=yasp \
  --parameters BasicAuthPassword="$BASIC_AUTH_PASSWORD" \
  --parameters OriginSecret="$ORIGIN_SECRET"
```

## Deployment Flow

The stack keeps infrastructure and app deployment separate:

- Infrastructure changes: run `cdk deploy`
- App changes: build image, push a new explicit tag or digest to ECR, then run `cdk deploy` with that tag or digest

The EC2 instance boots with Docker and nginx, logs into ECR, pulls the configured image, and starts `yasp.service` automatically. The bootstrap is part of instance user data, so changing the configured image reference causes the instance to be replaced on deploy. That is intentional and keeps the runtime reproducible, but it also interrupts active in-memory rooms.

## Configuration

### CloudFormation parameters

| Parameter           | Required | Default | Description |
| --- | --- | --- | --- |
| `BasicAuthUsername` | No | `yasp` | HTTP Basic Auth username |
| `BasicAuthPassword` | Yes | — | HTTP Basic Auth password |
| `OriginSecret` | Yes | — | Hex secret used by CloudFront and nginx |

### CDK context

| Context Key | Required | Default | Description |
| --- | --- | --- | --- |
| `imageTag` | * | — | Image tag to deploy |
| `imageDigest` | * | — | Image digest to deploy |
| `ecrRepoName` | No | `yasp` | ECR repository name |
| `serviceName` | No | `yasp` | Resource naming prefix |
| `createRepository` | No | `false` | Create the ECR repository in CDK |
| `retainLogBucket` | No | `false` | Retain CloudFront logs on teardown |
| `alarmTopicArn` | No | — | SNS topic ARN for alarm notifications |
| `instanceType` | No | `t3.micro` | EC2 instance type for the origin |

\* Exactly one of `imageTag` or `imageDigest` is required. `imageTag=latest` is rejected.

## Outputs

| Output | Description |
| --- | --- |
| `CloudFrontUrl` | Primary authenticated entry point |
| `Ec2PublicDnsName` | Public DNS name of the origin instance |
| `Ec2PublicIp` | Public IP of the origin instance |
| `InstanceId` | EC2 instance ID |
| `SsmStartSessionCommand` | Ready-to-run SSM start-session command |
| `EcrRepositoryUri` | ECR repository URI |
| `DeployedImageReference` | Exact tag or digest deployed |
| `EdgeWafArn` | CloudFront WAF ARN |
| `AccessLogsBucket` | S3 bucket containing CloudFront access logs |

## Operations

### Access logs

CloudFront access logs go to an S3 bucket with:

- public access blocked
- S3-managed encryption
- SSL-only access
- 30-day lifecycle expiration by default
- 90-day retention and `RETAIN` behavior when `-c retainLogBucket=true`

### Alarms

The stack creates:

- `CloudFront5xxAlarm`
- `Ec2StatusCheckFailedAlarm`

If `-c alarmTopicArn=...` is provided, both alarms publish to that SNS topic.

### SSM management

SSM Session Manager is the preferred management path. Port 22 is not opened by default.

Start a session:

```bash
aws ssm start-session --target <INSTANCE_ID>
```

Useful commands on the instance:

```bash
sudo systemctl status yasp
sudo systemctl restart yasp
sudo journalctl -u yasp -n 100 --no-pager
sudo docker logs yasp --tail 200
```

### Roll forward to a new image

```bash
# From the cdk/ directory — use --platform linux/amd64 on Apple Silicon
docker build --platform linux/amd64 -t yasp:0.2.0 ..
docker tag yasp:0.2.0 <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/yasp:0.2.0
docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/yasp:0.2.0

npx cdk deploy \
  -c imageTag=0.2.0 \
  -c instanceType=t3.micro \
  --parameters BasicAuthUsername=yasp \
  --parameters BasicAuthPassword="$BASIC_AUTH_PASSWORD" \
  --parameters OriginSecret="$ORIGIN_SECRET"
```

If you keep the same image reference and want to force a re-pull manually, use SSM and restart `yasp.service`. The preferred flow is still to publish a new explicit tag or digest.

### Rotate credentials

Rotate Basic Auth:

```bash
NEW_PASSWORD=$(openssl rand -base64 24)
npx cdk deploy \
  -c imageTag=0.2.0 \
  -c instanceType=t3.micro \
  --parameters BasicAuthUsername=yasp \
  --parameters BasicAuthPassword="$NEW_PASSWORD" \
  --parameters OriginSecret="$ORIGIN_SECRET"
```

Rotate the origin secret:

```bash
NEW_SECRET=$(openssl rand -hex 32)
npx cdk deploy \
  -c imageTag=0.2.0 \
  -c instanceType=t3.micro \
  --parameters BasicAuthUsername=yasp \
  --parameters BasicAuthPassword="$BASIC_AUTH_PASSWORD" \
  --parameters OriginSecret="$NEW_SECRET"
```

## Known Tradeoffs

- Single instance only: no HA, no rolling deploys, and no horizontal scale
- In-memory room state means instance replacement or restart disrupts active sessions
- Origin traffic from CloudFront to EC2 is HTTP, not HTTPS, to keep the stack small and operationally simple
- CloudFront custom origins have a maximum origin read timeout of 60 seconds. Idle WebSocket connections may be dropped at that interval. Socket.IO reconnects automatically, but brief interruptions are possible during quiet periods
- The cost profile is intentionally low, but CloudFront WAF still adds a real monthly baseline
- Scaling beyond a small team would require shared state and a different runtime architecture

## Tear Down

```bash
npx cdk destroy
```

If `createRepository=true` was used, the ECR repository is retained and must be deleted manually:

```bash
aws ecr delete-repository --repository-name yasp --force --region us-east-1
```

## Generated Artifacts

Do not commit:

- `cdk.out/`
- `cdk.context.json`
- `node_modules/`
- `dist/`

`cdk.out/` can contain synthesized templates and resolved values. Treat it as sensitive build output.
