```
 __  __ ___   ___ ___     ×     _   _      _____ 
 \ \/ // _ \ / __| _ \       /_\ \ / /\ \ / / __|
  \  / (_) |\__ \  _/       / _ \ V /  \ V /\__ \
  /_/ \__\_\|___/_|        /_/ \_\_|    \_/ |___/
```

<div align="center">

### ☁️ CloudFront · WAF · EC2 · CDK

[![CDK](https://img.shields.io/badge/AWS_CDK-v2-FF9900?style=flat-square&logo=amazon-aws&logoColor=white)](https://docs.aws.amazon.com/cdk/v2/guide/home.html)
[![Region](https://img.shields.io/badge/region-us--east--1-FF9900?style=flat-square&logo=amazon-aws&logoColor=white)](https://aws.amazon.com)
[![Node 20](https://img.shields.io/badge/node-20+-6C63FF?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org)

*Optional infrastructure-as-code for hosting YASP behind CloudFront on a single EC2 instance.*
*YASP runs fine as a plain Docker container — this stack adds CloudFront, WAF, and Basic Auth for lightweight internal-tool hosting.*

</div>

---

## 🏗️ Architecture

```
                            ┌──────────────────────┐
                            │   Edge WAF           │
                            │   (us-east-1)        │
                            │   • Managed rules    │
                            │   • Rate limiting    │
                            └──────────┬───────────┘
                                       │
  ┌─────────┐  Basic Auth  ┌───────────▼───────────┐  Origin Secret  ┌──────────────────────────┐
  │ Browser │ ────────────▶│  CloudFront            │ ──────────────▶ │ EC2  +  nginx  +  Docker │
  └─────────┘              │  + CF Function         │  custom header  │ YASP container :3001     │
                           └───────────────────────┘                 └──────────────────────────┘
```

Request flow:

1. **WAF** evaluates managed rules and rate limits at the edge
2. **CloudFront Function** enforces HTTP Basic Auth
3. CloudFront adds `x-yasp-origin-secret` and forwards to EC2
4. **EC2 security group** allows inbound only from CloudFront IP ranges
5. **nginx** validates the origin secret and proxies to the YASP container
6. **WebSocket upgrades** flow through the same path (CloudFront forwards upgrade headers, nginx sets required proxy headers)

> **Why EC2?** YASP keeps room state in process memory and uses WebSockets. That requires a long-running process with stable connections — a single EC2 instance is the simplest shape without introducing ECS, Redis, or orchestration.

---

## 🔒 Security Model

Appropriate for a small internal tool — not a high-assurance security boundary.

| Layer | What it does |
|---|---|
| Edge WAF | Managed rule protection + rate limiting |
| CloudFront Function | HTTP Basic Auth |
| Origin secret header | nginx validates before requests reach the app |
| EC2 security group | Inbound only from CloudFront origin prefix list, port 80 |
| Container hardening | Non-root user · read-only rootfs · all Linux capabilities dropped · `no-new-privileges` · `--pids-limit` · `--memory` · `--cpus` |
| CloudFormation secrets | Passed as `NoEcho` parameters |

> **Tradeoffs:** The Basic Auth credential is visible in the CloudFront Function source in AWS. The origin secret is present in the synthesized template and on the instance. This is pragmatic deterrence — if the threat model grows, move to a real IdP.

Full security picture → [`SECURITY_THREAT_MODEL.md`](../SECURITY_THREAT_MODEL.md) · [`SECURITY_AUDIT_REPORT.md`](../SECURITY_AUDIT_REPORT.md) · [`SECURITY_REMEDIATION_PLAN.md`](../SECURITY_REMEDIATION_PLAN.md)

---

## ✅ Prerequisites

- AWS account with permissions for EC2, CloudFront, WAF, ECR, IAM, S3, SNS, CloudWatch, SSM
- AWS CLI v2 configured, CDK bootstrapped in `us-east-1`
- Node.js 20+, npm, Docker
- Must deploy in `us-east-1` — CloudFront WAF requires `CLOUDFRONT` scope

---

## 🚀 Setup

### 1 — Install and bootstrap

```bash
cd cdk
npm install
npx cdk bootstrap aws://<ACCOUNT_ID>/us-east-1
```

### 2 — ECR repository

Either let CDK create one with `-c createRepository=true`, or import an existing repo by name (default: `yasp`).

### 3 — Build and push the image

The EC2 origin runs x86_64. On Apple Silicon, add `--platform linux/amd64`.

```bash
docker build --platform linux/amd64 -t yasp:0.1.0 ..

aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

docker tag yasp:0.1.0 <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/yasp:0.1.0
docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/yasp:0.1.0
```

### 4 — Generate secrets

```bash
BASIC_AUTH_PASSWORD=$(openssl rand -base64 24)
ORIGIN_SECRET=$(openssl rand -hex 32)
```

### 5 — Deploy

```bash
npx cdk deploy \
  -c imageTag=0.1.0 \
  -c instanceType=t3.micro \
  --parameters BasicAuthUsername=yasp \
  --parameters BasicAuthPassword="$BASIC_AUTH_PASSWORD" \
  --parameters OriginSecret="$ORIGIN_SECRET"
```

For digest pinning, use `-c imageDigest=<digest>` instead of `-c imageTag`.

---

## ⚙️ Configuration

### CloudFormation Parameters

| Parameter | Required | Default | Description |
|---|---|---|---|
| `BasicAuthUsername` | No | `yasp` | HTTP Basic Auth username |
| `BasicAuthPassword` | ✅ | — | HTTP Basic Auth password |
| `OriginSecret` | ✅ | — | Hex secret validated by nginx |

### CDK Context

| Key | Required | Default | Description |
|---|---|---|---|
| `imageTag` | * | — | Image tag to deploy |
| `imageDigest` | * | — | Image digest to deploy |
| `ecrRepoName` | No | `yasp` | ECR repository name |
| `serviceName` | No | `yasp` | Resource naming prefix |
| `createRepository` | No | `false` | Create ECR repository in CDK |
| `retainLogBucket` | No | `false` | Retain CloudFront logs on teardown |
| `alarmTopicArn` | No | — | SNS topic ARN for alarm notifications |
| `instanceType` | No | `t3.micro` | EC2 instance type |

\* Exactly one of `imageTag` or `imageDigest` required. `imageTag=latest` is rejected.

### Stack Outputs

| Output | Description |
|---|---|
| `CloudFrontUrl` | Primary authenticated entry point |
| `InstanceId` | EC2 instance ID |
| `OriginLogGroupName` | CloudWatch Logs group for origin container logs |
| `SsmStartSessionCommand` | Ready-to-run SSM session command |
| `EcrRepositoryUri` | ECR repository URI |
| `DeployedImageReference` | Exact tag or digest deployed |
| `EdgeWafArn` | CloudFront WAF ARN |
| `AccessLogsBucket` | CloudFront access logs bucket |

---

## 🛠️ Operations

### SSM Access

Port 22 is not opened. SSM Session Manager is the only management path.

```bash
aws ssm start-session --target <INSTANCE_ID>

# On the instance:
sudo systemctl status yasp
sudo systemctl restart yasp
sudo docker logs yasp --tail 200
```

### CloudWatch Logs

Container stdout/stderr ships to CloudWatch via Docker's `awslogs` driver.

```bash
# Tail live origin logs
aws logs tail /yasp/origin --since 1h --follow --region us-east-1
```

Useful Logs Insights filter:

```
fields @timestamp, event, message, stack
| filter event in ["uncaughtException", "unhandledRejection", "client_error"]
| sort @timestamp desc
```

### Deploy a New Image

**Path A — GitHub Actions (preferred for routine deploys)**

`.github/workflows/deploy-aws.yml` runs on every successful push to `main`:
pulls image from Docker Hub → pushes to ECR → SSM rewrites `yasp-run.sh` → restarts `yasp` systemd unit.
If `/api/health` fails after restart, automatically rolls back to the previous `IMAGE_IDENTIFIER`.

Required GitHub Actions variables (Settings → Environments → `production` → Environment variables):

| Variable | Example | Purpose |
|---|---|---|
| `INSTANCE_ID` | `i-0123456789abcdef0` | Target EC2 instance |
| `AWS_REGION` | `us-east-1` | Region of ECR repo + instance |
| `ECR_REPO` | `yasp` | ECR repository name |
| `DOCKERHUB_IMAGE` | `wleonhardt/yasp` | Public Docker Hub source image |

Also requires `secrets.AWS_DEPLOY_ROLE_ARN` — an IAM role whose trust policy restricts GitHub OIDC `sub` to this repo + branch + `production` environment.

**Path B — Full CDK redeploy**

Build, tag, push, re-run `cdk deploy` with the new `-c imageTag=<version>`. Changing the image reference replaces the instance — disrupts active rooms. Use this when userdata, security group, WAF rules, or other stack-level resources change. For plain image swaps, prefer Path A.

### Post-Deploy Checklist

After either deploy path:

- [ ] `GET /api/health` returns `200` through the CloudFront URL
- [ ] `sudo systemctl status yasp` is healthy on the instance
- [ ] `sudo docker logs yasp --tail 200` shows expected image reference and no startup errors
- [ ] CloudWatch origin logs are clean after the restart window
- [ ] Manual smoke flow: create room → join from second browser → cast votes → reveal → reset → leave

### Rotate Credentials

Re-run `cdk deploy` with new `--parameters BasicAuthPassword` or `--parameters OriginSecret` values.

### Alarms

`CloudFront5xxAlarm` and `Ec2StatusCheckFailedAlarm` are created automatically. Both publish to the SNS topic if `-c alarmTopicArn` is provided.

### Access Logs

CloudFront logs → S3 bucket with public access blocked, encryption, SSL-only, 30-day expiration (90-day with `-c retainLogBucket=true`).

---

## ⚠️ Known Tradeoffs

```
  ┌────────────────────────────────────────────────────────────┐
  │  Single instance — no HA, no rolling deploys               │
  │  Instance replacement disrupts active in-memory rooms      │
  │  Redis deployment support intentionally deferred           │
  │  CloudFront → EC2 is HTTP (not HTTPS) by design            │
  │  60s CloudFront origin timeout — idle WS may be dropped    │
  │  CloudFront WAF adds a real monthly baseline cost          │
  └────────────────────────────────────────────────────────────┘
```

This stack deploys the **default memory profile**. Redis infrastructure is not wired in by design — it would increase cost and moving parts while implying a scaling maturity YASP does not yet claim. If Redis deployment support lands later, it will be a separate advanced profile.

---

## 🗑️ Tear Down

```bash
npx cdk destroy
```

If `createRepository=true` was used, the ECR repository is retained and must be deleted manually:

```bash
aws ecr delete-repository --repository-name yasp --force --region us-east-1
```

> Do not commit `cdk.out/` — it can contain synthesized templates with resolved secrets.
