# YASP — AWS Deployment (CDK)

Optional infrastructure-as-code for deploying YASP to AWS using App Runner, CloudFront, and WAF.

> **This module is entirely optional.** YASP runs fine as a standalone Docker container. This CDK stack adds managed AWS hosting with lightweight access control.

## Architecture

```
                                    ┌─────────────────┐
                                    │  Edge WAF        │
                                    │  (CLOUDFRONT)    │
                                    │  • Managed rules │
                                    │  • Rate limiting │
                                    └────────┬────────┘
                                             │
┌──────────┐     Basic Auth      ┌───────────▼───┐   Origin Secret   ┌──────────────┐
│  Browser  │ ──────────────────▶ │  CloudFront    │ ────────────────▶ │  App Runner   │
└──────────┘                     │  + CF Function │   (custom hdr)    │  (YASP:3001)  │
                                 └───────────────┘                    └──────┬───────┘
                                                                           │
                                                                     ┌─────▼──────┐
                                                                     │ Origin WAF  │
                                                                     │ (REGIONAL)  │
                                                                     └────────────┘
```

**Traffic flow:**

1. User visits the CloudFront URL
2. Edge WAF evaluates managed rules and rate limits
3. CloudFront Function checks HTTP Basic Auth credentials
4. If valid, the Authorization header is stripped and the request is forwarded to App Runner
5. CloudFront adds a custom `x-yasp-origin-secret` header to the origin request
6. Origin WAF on App Runner allows only requests with the correct secret header
7. Direct access to the App Runner URL (bypassing CloudFront) is blocked by the origin WAF

### Why ECR instead of Docker Hub?

AWS App Runner cannot pull images directly from Docker Hub. It requires either a private ECR repository or ECR Public. This stack uses a private ECR repository, so you must either create the repo manually or let CDK create it (see `createRepository`).

### Health check strategy

App Runner health checks use **TCP** (port-level liveness), not HTTP. TCP was chosen specifically to avoid depending on assumptions about whether App Runner's internal health probes are subject to WAF evaluation. Since the origin WAF blocks all HTTP requests lacking the secret header, an HTTP health check could fail if probes pass through WAF. TCP sidesteps this entirely — it operates below the HTTP layer and is sufficient to confirm the container is running on port 3001.

### Security model

This stack implements **lightweight deterrence, not strong authentication**. It is a pragmatic compromise appropriate for small internal tools, not a substitute for a proper identity provider.

- **Basic Auth** credentials are sent as base64-encoded plaintext (over HTTPS). The credential is ultimately embedded in the CloudFront Function source code at deploy time. While NoEcho prevents leakage through CloudFormation APIs, the function code itself is visible in the CloudFront console. This is an inherent limitation of edge-based Basic Auth.
- **Origin secret header** (`x-yasp-origin-secret`) prevents direct access to the App Runner URL, but the value is present in the CloudFormation template. NoEcho reduces accidental exposure; it does not constitute secure secret storage.
- **Edge WAF** provides managed rule protection and rate limiting at the CloudFront layer.
- **NoEcho parameters** prevent secrets from appearing in `describe-stacks` output, the CloudFormation console, CLI history, or cached `cdk.context.json` files. This reduces the most common accidental leakage vectors.

**Bottom line:** If your threat model requires strong authentication, add a proper IdP (Cognito, SSO, etc.) rather than relying on this Basic Auth layer.

## Prerequisites

- **AWS account** with permissions for App Runner, CloudFront, WAF, ECR, S3, IAM, CloudWatch
- **AWS CLI v2** installed and configured (`aws configure`)
- **Node.js 20+** and npm
- **Docker** (for pulling and pushing the YASP image)
- **CDK bootstrapped** in your target account/region
- **Region:** Deploy to **us-east-1** — the CloudFront WAF uses scope `CLOUDFRONT`, which requires all resources to be in us-east-1

## Setup

### 1. Install dependencies

```bash
cd cdk
npm install
```

### 2. Bootstrap CDK (first time only)

```bash
npx cdk bootstrap aws://<ACCOUNT_ID>/us-east-1
```

### 3. ECR repository

Choose one of two approaches:

**Option A: Let CDK create the repository**

Pass `-c createRepository=true` on first deploy. CDK will create a private ECR repository named `yasp` with a lifecycle rule keeping the last 10 images. The repo is retained on stack deletion.

With this option, you must deploy in two steps:

```bash
# Step 1: Deploy infra (App Runner will fail because the image doesn't exist yet)
# This creates the ECR repo so you have somewhere to push.
# Alternatively, create just the repo with the AWS CLI first.

# Create the repo manually first (simpler):
aws ecr create-repository --repository-name yasp --region us-east-1

# Then push the image (step 3b below) and deploy.
```

**Option B: Use an existing repository (default)**

If the ECR repo already exists, CDK imports it by name. This is the default behavior (`createRepository=false`).

### 3b. Push the image to ECR

The image must exist in ECR **before** App Runner can start. App Runner validates the image at service creation time — if it's missing, CloudFormation will fail and roll back.

```bash
# Pull from Docker Hub
docker pull wleonhardt/yasp:latest

# Authenticate Docker to your ECR registry
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

# Tag with a version (do NOT use :latest for deployments)
docker tag wleonhardt/yasp:latest <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/yasp:0.1.0

# Push
docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/yasp:0.1.0
```

### 4. Deploy

Generate secrets first:

```bash
BASIC_AUTH_PASSWORD=$(openssl rand -base64 24)
ORIGIN_SECRET=$(openssl rand -hex 32)
echo "Password: $BASIC_AUTH_PASSWORD"
echo "Origin secret: $ORIGIN_SECRET"
```

Deploy with parameters. Secrets are passed as `--parameters` (NoEcho), non-secret config as `-c` context:

```bash
npx cdk deploy \
  -c imageTag=0.1.0 \
  --parameters BasicAuthUsername=yasp \
  --parameters BasicAuthPassword="$BASIC_AUTH_PASSWORD" \
  --parameters OriginSecret="$ORIGIN_SECRET"
```

This approach keeps secrets out of CDK context files and CLI history (when using shell variables).

Alternatively, use a digest for maximum reproducibility:

```bash
# Get the digest after pushing
DIGEST=$(aws ecr describe-images \
  --repository-name yasp \
  --image-ids imageTag=0.1.0 \
  --query 'imageDetails[0].imageDigest' \
  --output text \
  --region us-east-1)

npx cdk deploy \
  -c imageDigest=$DIGEST \
  --parameters BasicAuthUsername=yasp \
  --parameters BasicAuthPassword="$BASIC_AUTH_PASSWORD" \
  --parameters OriginSecret="$ORIGIN_SECRET"
```

### Deploy outputs

| Output                    | Description                                       |
| ------------------------- | ------------------------------------------------- |
| `EcrRepositoryUri`        | Where to push Docker images                       |
| `DeployedImageReference`  | Exact image tag or digest deployed                 |
| `AppRunnerServiceUrl`     | Direct App Runner URL (blocked by origin WAF)     |
| `AppRunnerServiceArn`     | Service ARN for manual redeployment                |
| `CloudFrontUrl`           | **Use this** — authenticated entry point           |
| `OriginWafArn`            | WAF protecting App Runner from direct access      |
| `EdgeWafArn`              | WAF protecting CloudFront viewers                  |
| `AccessLogsBucket`        | S3 bucket holding CloudFront access logs           |

## Configuration

### CloudFormation parameters (secrets)

Passed via `--parameters` at deploy time. NoEcho prevents leakage in CloudFormation APIs.

| Parameter            | Required | Default  | Description                          |
| -------------------- | -------- | -------- | ------------------------------------ |
| `BasicAuthUsername`  | No       | `yasp`   | HTTP Basic Auth username             |
| `BasicAuthPassword`  | Yes      | —        | HTTP Basic Auth password (min 8)     |
| `OriginSecret`       | Yes      | —        | CloudFront-to-origin secret (min 16) |

### CDK context (non-secret)

Passed via `-c` flags at deploy time.

| Context Key               | Required | Default  | Description                                    |
| ------------------------- | -------- | -------- | ---------------------------------------------- |
| `imageTag`                | *        | —        | Image tag to deploy (e.g. `0.1.0`)             |
| `imageDigest`             | *        | —        | Image digest (e.g. `sha256:abc123...`)          |
| `ecrRepoName`             | No       | `yasp`   | ECR repository name                             |
| `serviceName`             | No       | `yasp`   | App Runner service name                         |
| `autoDeploymentsEnabled`  | No       | `false`  | Auto-deploy on ECR image push                  |
| `createRepository`        | No       | `false`  | Create the ECR repo in CDK instead of importing |
| `retainLogBucket`         | No       | `false`  | Retain access log bucket on stack deletion      |
| `alarmTopicArn`           | No       | —        | SNS topic ARN for alarm notifications           |

\* Exactly one of `imageTag` or `imageDigest` is required. `latest` is explicitly rejected.

## Updating the Deployment

When a new YASP Docker image is published:

```bash
# Pull the new image
docker pull wleonhardt/yasp:latest

# Tag with a new version
docker tag wleonhardt/yasp:latest <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/yasp:0.2.0

# Push to ECR
docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/yasp:0.2.0

# Deploy with the new tag (re-supply parameters)
npx cdk deploy \
  -c imageTag=0.2.0 \
  --parameters BasicAuthUsername=yasp \
  --parameters BasicAuthPassword="$BASIC_AUTH_PASSWORD" \
  --parameters OriginSecret="$ORIGIN_SECRET"
```

If `autoDeploymentsEnabled` is `true` and you push to the same tag, App Runner redeploys automatically without a CDK deploy. However, this only works for same-tag pushes — changing the tag in the CDK stack always requires `cdk deploy`.

## Rotating Credentials

### Rotate Basic Auth password

```bash
NEW_PASSWORD=$(openssl rand -base64 24)
npx cdk deploy \
  -c imageTag=0.2.0 \
  --parameters BasicAuthUsername=yasp \
  --parameters BasicAuthPassword="$NEW_PASSWORD" \
  --parameters OriginSecret="$ORIGIN_SECRET"
```

This updates the CloudFront Function. Propagation takes a few seconds.

### Rotate origin secret

```bash
NEW_SECRET=$(openssl rand -hex 32)
npx cdk deploy \
  -c imageTag=0.2.0 \
  --parameters BasicAuthUsername=yasp \
  --parameters BasicAuthPassword="$BASIC_AUTH_PASSWORD" \
  --parameters OriginSecret="$NEW_SECRET"
```

This updates both the CloudFront origin custom header and the origin WAF rule simultaneously.

## Observability

### Alarms

The stack creates two CloudWatch alarms:

- **AppRunner5xxAlarm** — fires when App Runner returns more than 10 5xx responses in two consecutive 5-minute periods.
- **CloudFront5xxAlarm** — fires when the CloudFront 5xx error rate exceeds 5% for two consecutive 5-minute periods.

**Notifications:** By default, alarms have no notification action. To receive alerts, pass `-c alarmTopicArn=arn:aws:sns:us-east-1:123456789012:my-topic` and both alarms will notify that SNS topic. You can also attach an SNS topic manually via the AWS console after deployment.

### Access logs

CloudFront access logs are written to an S3 bucket with:
- Public access blocked
- S3-managed encryption
- 30-day lifecycle expiration (90-day if `retainLogBucket=true`)
- Auto-delete on stack teardown (retained if `retainLogBucket=true`)

For production-like environments, use `-c retainLogBucket=true` to preserve logs after stack deletion.

### WAF metrics

Both WAF web ACLs emit CloudWatch metrics:
- `YaspOriginWaf` / `YaspOriginWafAllowSecret` — origin protection
- `YaspEdgeWaf` / `YaspEdgeWafCommonRules` / `YaspEdgeWafRateLimit` — edge protection

## Rate Limit Tuning

The edge WAF rate-based rule defaults to **2000 requests per 5 minutes per source IP**. This is intentionally conservative for a small team tool.

You may need to adjust this value if:
- Users share a NAT or VPN egress IP (common in offices)
- You run load tests against the CloudFront endpoint
- Bot traffic patterns require a higher or lower threshold

To change the limit, edit the `limit` value in `lib/yasp-stack.ts` and redeploy. The minimum allowed by AWS WAF is 100.

## WAF Association

The origin WAF association (WAF ↔ App Runner) uses explicit CDK dependency ordering to ensure the WAF is fully provisioned before association. In rare cases, WAF propagation may lag behind the CloudFormation API response. If you see an intermittent association failure on first deploy, a simple `cdk deploy` retry resolves it. No custom retry resource is included to keep the stack simple.

## Tear Down

```bash
npx cdk destroy
```

If you used `createRepository=true`, the ECR repository is retained by default and must be deleted manually:

```bash
aws ecr delete-repository --repository-name yasp --force --region us-east-1
```

If you used the default (`createRepository=false`), the repo was never managed by CDK.

## Generated Artifacts

The following are generated during CDK operations and must not be committed:

- `cdk.out/` — synthesized CloudFormation templates (may contain resolved secrets)
- `cdk.context.json` — cached context lookups
- `node_modules/` and `dist/`

These are covered by the project's `.gitignore`. If `cdk.context.json` somehow gets tracked, remove it:

```bash
git rm --cached cdk/cdk.context.json
```

**Warning:** `cdk.out/` can contain the full CloudFormation template with resolved parameter defaults. Never commit this directory.

## Cost Estimate

At minimal usage, approximate monthly costs:

| Service      | Estimate             |
| ------------ | -------------------- |
| App Runner   | ~$5/mo (paused)      |
| CloudFront   | Free tier eligible   |
| WAF (×2)     | ~$10/mo + per-request |
| ECR          | <$1/mo               |
| S3 (logs)    | <$1/mo               |

App Runner charges for provisioned instances. With `0.25 vCPU / 0.5 GB`, costs are modest for a team tool. The second WAF adds ~$5/mo.

## Limitations

- **Region:** The stack must deploy to **us-east-1** because the CloudFront WAF (`CLOUDFRONT` scope) requires it. All resources are created in this region.
- **WebSocket via CloudFront:** CloudFront supports WebSocket upgrades. The `ALL_VIEWER_EXCEPT_HOST_HEADER` origin request policy forwards the `Upgrade` and `Connection` headers. Socket.IO should negotiate WebSocket transport through CloudFront, falling back to HTTP long-polling if needed.
- **No custom domain:** Add a custom domain via App Runner console or extend the stack with Route 53 + ACM.
- **Basic Auth visibility:** The encoded credentials are visible in the CloudFront Function source code via the AWS console. NoEcho only prevents leakage through CloudFormation APIs and CLI-level workflows.
- **Not a security boundary:** The entire access control layer (Basic Auth + origin secret + WAF) is designed as lightweight deterrence for an internal tool. Do not treat it as equivalent to proper authentication.
