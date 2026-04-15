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

This stack deploys the **default memory profile** today. It does not wire
first-class `YASP_STATE_BACKEND=redis` / `REDIS_URL` support into the
userdata/systemd bootstrap, and it should not be described as a multi-instance
or Redis-backed deployment path yet.

That is intentional. YASP keeps the AWS path memory-only by default because it
is the simplest supportable operator profile today. Adding Redis infrastructure
now would increase cost, moving parts, and failure modes while implying a
scaling maturity the product does not yet claim.

If Redis deployment support is added later, it should land as a separate
advanced deployment profile after the remaining multi-instance coordination
work is complete enough to support it honestly.

## Security Model

This stack is appropriate for a small internal tool, not a high-assurance security boundary.

- Basic Auth at the CloudFront edge
- Origin secret header checked by nginx before requests reach the app
- EC2 allows inbound only from the CloudFront origin-facing prefix list on port 80
- WAF provides managed rule protection and rate limiting
- Secrets passed as CloudFormation `NoEcho` parameters
- The YASP container runs as a non-root user on a read-only rootfs with all Linux capabilities dropped, `no-new-privileges`, and bounded `--pids-limit` / `--memory` / `--cpus` (see [`lib/ec2-origin-bootstrap.ts`](./lib/ec2-origin-bootstrap.ts))

**Tradeoffs:** The Basic Auth credential is visible in the CloudFront Function source in AWS. The origin secret is present in the synthesized template and on the instance. This is pragmatic deterrence — if the threat model grows, move to a real IdP.

For the full security picture (threat model, audit findings, remaining backlog) see the top-level [`SECURITY_THREAT_MODEL.md`](../SECURITY_THREAT_MODEL.md), [`SECURITY_AUDIT_REPORT.md`](../SECURITY_AUDIT_REPORT.md), and [`SECURITY_REMEDIATION_PLAN.md`](../SECURITY_REMEDIATION_PLAN.md).

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

There are two supported paths, depending on whether you want a full stack redeploy or just an image swap.

**Path A — GitHub Actions (preferred for routine deploys).** `.github/workflows/deploy-aws.yml` runs on every successful push to `main`: it pulls the image from Docker Hub, pushes to ECR, and uses SSM to rewrite `/usr/local/bin/yasp-run.sh` on the instance and restart the `yasp` systemd unit. The deploy script captures the previously-deployed `IMAGE_IDENTIFIER` before the swap; if the new image fails its `/api/health` check, it automatically restores the previous image and restarts. The workflow still exits non-zero after a rollback so the failure surfaces red.

Required GitHub Actions variables (set under **Settings → Environments → `production` → Environment variables**):

| Variable          | Example                     | Purpose |
| ----------------- | --------------------------- | ------- |
| `INSTANCE_ID`     | `i-0123456789abcdef0`       | Target EC2 instance for the SSM deploy |
| `AWS_REGION`      | `us-east-1`                 | Region of the ECR repo + instance |
| `ECR_REPO`        | `yasp`                      | ECR repository name |
| `DOCKERHUB_IMAGE` | `wleonhardt/yasp`           | Public Docker Hub source image |

The workflow also needs `secrets.AWS_DEPLOY_ROLE_ARN` pointing at an IAM role whose trust policy restricts GitHub OIDC `sub` to this repo + branch + the `production` environment.

**Path B — full CDK redeploy.** Build, tag, push, then re-run `cdk deploy` with the new `-c imageTag=<version>`. Changing the image reference replaces the instance — this is intentional for reproducibility but disrupts active rooms. Use this when the userdata, security group, WAF rules, or other stack-level resources change; for plain image swaps prefer Path A.

### Post-deploy operator checks

After either deploy path, operators should at minimum verify:

1. `GET /api/health` returns `200` through the CloudFront URL.
2. `sudo systemctl status yasp` is healthy on the instance.
3. `sudo docker logs yasp --tail 200` shows the expected image reference and no
   startup errors.
4. CloudWatch origin logs are clean after the restart window.
5. One manual smoke flow works end to end: create room, join from a second
   browser/device, cast votes, reveal, reset, and leave.

### Rotate credentials

Re-run `cdk deploy` with new `--parameters BasicAuthPassword` or `--parameters OriginSecret` values.

### Alarms

The stack creates `CloudFront5xxAlarm` and `Ec2StatusCheckFailedAlarm`. Both publish to the SNS topic if `-c alarmTopicArn` is provided.

### Access logs

CloudFront logs go to an S3 bucket with public access blocked, encryption, SSL-only access, and 30-day expiration (90-day with `-c retainLogBucket=true`).

## Known Tradeoffs

- Single instance — no HA, no rolling deploys, no horizontal scale
- Instance replacement disrupts active in-memory rooms
- First-class Redis-backed deployment wiring is intentionally deferred in this
  stack; the default AWS profile stays memory-only by design
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
