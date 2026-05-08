# Operations Runbook

```
   ___  _ __  ___   _ __ _   _ _ __  __ ___  ___  _  __
  / _ \| '_ \/ __| | '__| | | | '_ \| '_ \ / _ \/ |/ /
 | (_) | |_) \__ \ | |  | |_| | | | | |_) | (_) | / _ \
  \___/| .__/|___/ |_|   \__,_|_| |_|_.__/ \___/|_\___/
       |_|

  Runtime monitoring and recovery for the deployed YASP instance.
  Deliberately small — YASP is intentionally lightweight to operate.
```

> For build/test/deploy automation see [`docs/security-scanning.md`](./security-scanning.md) and [`docs/branch-protection.md`](./branch-protection.md).  
> For scaling posture see [`docs/horizontal-scaling.md`](./horizontal-scaling.md).

---

## What "Operating YASP" Means

The deployed app is ephemeral by design:

```
  No database  →  active room state is in-process memory
                  (or optional Redis — still single-instance)

  No accounts  →  nothing to lock out, nothing to expire

  No history   →  a restart drops active rooms
                  that is a feature, not an outage
```

The operational surface is exactly four things:

```
  1.  Container is running and serving  /api/health
  2.  TLS certificate in front of it is valid
  3.  Realtime endpoint sustains Socket.IO upgrades end-to-end
  4.  Container restarts are rare and recoverable
```

Anything beyond this list is product work, not ops work.

---

## ❤️ Health Endpoint

```
GET /api/health  →  { "ok": true, "uptime": 1234.5, ... }
```

This is what every deploy uses to gate rollouts, what the Dockerfile
`HEALTHCHECK` polls, and what an external uptime monitor should hit.

Keep polling intervals gentle — **60 seconds is plenty**. The monitor is
not the SLO; the user-facing realtime path is.

---

## 📡 Uptime Monitoring

Pick **exactly one** external monitor. The endpoint is public, so the
cheapest option is fine.

| Option | Notes |
|---|---|
| [healthchecks.io](https://healthchecks.io/) | Free · ping check against `https://app.yasp.team/api/health` |
| [Upptime](https://upptime.js.org/) | Self-hosted · one GitHub workflow · status page included |
| CloudWatch Synthetics | AWS-native · only worthwhile if already paying for it |

Whichever you pick:

- Alert on **> 5 minutes** of missed health, not a single failure
- Alert to a channel a maintainer actually reads
- Include a link back to this runbook in the alert body

Do **not** layer multiple uptime providers — signal-to-noise falls fast.

---

## 🔐 TLS / Certificate Awareness

The hosted instance fronts EC2 with CloudFront + ACM. ACM certificates
auto-renew when CloudFront is the consumer, so the practical risk is
misconfiguration, not expiry.

**What to actually watch:**

- ACM console → confirm `Renewal eligibility: Eligible` and `Status: Issued`.
  If either flips, investigate immediately.
- 30-day external expiry probe is cheap insurance. Alert at **< 21 days**
  so there's real time to react.

If self-hosting without CloudFront: run certbot or equivalent and add the
same 21-day expiry alert.

---

## 🐳 Container Restart & Crash Visibility

The EC2 deployment runs the container under `systemctl yasp` and ships
logs to CloudWatch via the `awslogs` Docker logging driver. For plain-Docker
self-hosted deploys, use whatever log shipper the host already has.

**Useful one-liners on the EC2 host:**

```bash
systemctl status yasp --no-pager
journalctl -u yasp -n 200 --no-pager
docker logs yasp --tail 200
```

**Symptom → likely cause → action:**

| Symptom | Likely cause | Action |
|---|---|---|
| `systemctl status yasp` showing `failed` for > 1 restart | Unhealthy image or startup crash | `docker logs yasp --tail 500` + check last deploy workflow run |
| Repeated restart cycles in `journalctl` | OOM (container capped at 512 MiB) or unhealthy image | Check `docker stats`, review image change |
| `no space left on device` during deploy | Docker storage full on EC2 | Reclaim space (see below) |
| Successful deploy but unhealthy app | New image bad | Deploy workflow auto-rolls back — if rollback also failed, workflow exits red |

**Reclaim Docker space:**

```bash
docker system df
docker container prune -f
docker image prune -af
docker builder prune -af
docker volume prune -f
df -h / /var/lib/docker || df -h /
```

The deploy workflow logs `df -h` / `docker system df` and prunes automatically
before pulls and before rollback. Manual reclaim is only needed if an older
deploy hit this before that fix landed.

There is no managed alerting today — the deploy workflow's red run in
GitHub Actions is the primary incident signal. To add push alerts, hook a
CloudWatch Logs metric filter on the `awslogs` group for `panic|FATAL|exit`
patterns and route to SNS.

---

## 🔁 Realtime Connection Failures

YASP exposes per-tab connection diagnostics in the client UI. Operators do
not have a server-side dashboard for WebSocket upgrade failures — adding
analytics would contradict the ephemeral / no-history product boundary.

**What is feasible without changing that boundary:**

- **Synthetic Socket.IO probe:** have the uptime monitor perform a WebSocket
  upgrade against `wss://app.yasp.team/socket.io/?EIO=4&transport=websocket`
  and assert a `0{` handshake frame. Alert on sustained failure (≥ 10 min) only.
- **Browser-side diagnostics for support:** ask reporting users to copy the
  `Connection details` panel from the recovery notice. That panel avoids
  sensitive data and is exactly what triage needs.

**If the synthetic probe red-lines while `/api/health` is green:**

```
  Likely causes:
  ├── nginx upgrade headers misconfigured
  ├── CloudFront WebSocket behavior disabled
  └── EC2 security group blocking the upgrade port

  → Check the latest CDK diff first.
```

---

## 🚑 Recovery Playbook

### EC2 path

```
  1.  Re-run the latest successful "Deploy to AWS" workflow from the
      Actions tab. This re-pushes the most recent ECR image tag and
      re-issues the SSM restart.

  2.  If the EC2 instance itself is gone:
      Redeploy the CDK stack from  cdk/  — the bootstrap script
      idempotently re-installs the systemd unit and Docker.
      Active rooms are lost; that is expected.

  3.  CloudFront keeps serving the static SPA shell from cache during
      the outage. Users see the app load but realtime fail. The client's
      recovery UX (Retry · compatibility mode · diagnostics) surfaces this.
```

### Plain Docker path

```bash
docker pull wleonhardt/yasp:main
docker stop yasp || true
docker rm yasp   || true
docker run -d --restart unless-stopped --name yasp -p 3001:3001 wleonhardt/yasp:main
curl -fsS http://127.0.0.1:3001/api/health
```

---

## 📓 Maintenance Log

Operational events worth recording (cert rotations, capacity changes,
incident postmortems) belong as dated bullets in
[`plans/next-up.md`](../plans/next-up.md) under `## Done`. There is no
separate ops log — the planning queue is the timeline.
