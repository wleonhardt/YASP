# Operations runbook

This doc captures the **runtime-side** monitoring and recovery practices for
the deployed YASP instance. It is deliberately small. YASP runs as a single
Docker container (default) or a single EC2 + nginx + CloudFront stack via
the optional CDK path; both are documented to stay intentionally lightweight.

For build/test/deploy automation see
[`docs/security-scanning.md`](./security-scanning.md) and
[`docs/branch-protection.md`](./branch-protection.md). For scaling posture
see [`docs/horizontal-scaling.md`](./horizontal-scaling.md).

## What "operating YASP" means

The deployed app is ephemeral by design:

- No database. Active room state is in-process memory (or optional Redis,
  still single-instance).
- No accounts. Nothing to lock out, nothing to expire.
- No history. A restart drops active rooms; that is a feature, not an
  outage.

In practice that means the operational surface is:

1. The container is running and serving `/api/health`.
2. The TLS certificate in front of it is valid.
3. The realtime endpoint can sustain Socket.IO upgrades end-to-end.
4. Container restarts are rare and recoverable.

Anything beyond this list is product work, not ops work.

## Health endpoint

The container exposes:

```
GET /api/health
{ "ok": true, "uptime": 1234.5, ... }
```

This is what every deploy uses to gate rollouts (see
[`.github/workflows/deploy-aws.yml`](../.github/workflows/deploy-aws.yml))
and what the Dockerfile's `HEALTHCHECK` polls. It is the right thing for an
external uptime monitor to poll too.

Keep the polling interval gentle (60 s is plenty). The server is small, but
the monitor is not the SLO; the user-facing realtime path is.

## Recommended uptime monitoring

Pick exactly one external monitor. The endpoint is public, so the cheapest
option is fine.

- **Free / minimal:** [healthchecks.io](https://healthchecks.io/) ping check
  against `https://app.yasp.team/api/health`, alert on missed pings.
- **Self-hosted GitHub-Pages style:** [Upptime](https://upptime.js.org/) —
  one workflow, statuspage out of the box. No external SaaS. Pairs well
  with the rest of the GitHub-native posture.
- **AWS-native (only if already paying for it):** CloudWatch Synthetics
  canary with a 5-minute schedule against the same `/api/health`.

Whichever you pick:

- alert on `> 5 minutes` of missed health, not on a single failure;
- alert to a channel a maintainer actually reads;
- include a link back to this runbook in the alert body.

Do **not** layer multiple uptime SaaS providers. The signal-to-noise ratio
falls fast and the value does not multiply.

## TLS / certificate awareness

The hosted instance fronts the EC2 origin with CloudFront + ACM. ACM
certificates auto-renew when CloudFront is the consumer, so the practical
risk is misconfiguration, not expiry.

What to actually watch:

- ACM console for the issued certificate — confirm `Renewal eligibility`
  is `Eligible` and `Status` is `Issued`. If either flips, investigate
  immediately.
- A 30-day external expiry probe is still cheap insurance. Both
  healthchecks.io and Upptime can be configured for cert checks against
  `https://app.yasp.team/`. Alert at `< 21 days` so there is real time to
  react.

If you self-host without CloudFront, run certbot or your hosting provider's
equivalent and add the same 21-day expiry alert.

## Container restart and crash visibility

The EC2 deployment runs the container under `systemctl yasp` and ships
container logs to CloudWatch via the `awslogs` Docker logging driver (see
the bootstrap script). For a plain-Docker self-hosted deploy use whatever
log shipper the host already has.

Useful one-liners on the EC2 host:

```
systemctl status yasp --no-pager
journalctl -u yasp -n 200 --no-pager
docker logs yasp --tail 200
```

What to investigate:

- `systemctl status yasp` reporting `failed` for more than one restart cycle
  → check `docker logs yasp --tail 500` and the deploy workflow's last run
  for a failed health check.
- Repeated `Restart=` cycles in `journalctl -u yasp` → image is unhealthy or
  the host ran out of memory. The container is capped at 512 MiB by
  `ec2-origin-bootstrap.sh`; OOMs surface as restart loops.
- Successful deploy but unhealthy app → the deploy workflow already does an
  in-place rollback to the previously recorded `IMAGE_IDENTIFIER` (see
  [`deploy-aws.yml`](../.github/workflows/deploy-aws.yml)). If the rollback
  also failed, the workflow exits red and the runbook above kicks in.

There is no managed alerting wired here today; the deploy workflow's red run
in GitHub Actions is the primary incident signal. If the operator wants
push alerts, hook a CloudWatch Logs metric filter on the `awslogs` group
for `panic|FATAL|exit` patterns and route to SNS.

## Realtime connection failures

YASP already exposes per-tab connection diagnostics in the client UI (see
the **Realtime recovery and support** section of the README). Operators do
not have a server-side dashboard for "how often do clients fail to upgrade
to websockets" today, and that is intentional — adding analytics would
contradict the ephemeral / no-history product boundary.

What is feasible without changing that boundary:

- **Synthetic Socket.IO probe** from the uptime monitor: have it perform a
  websocket upgrade against `wss://app.yasp.team/socket.io/?EIO=4&transport=websocket`
  and assert a `0{` handshake frame. Both Upptime and healthchecks.io can
  do this. Alert on sustained failure (≥ 10 min) only.
- **Browser-side diagnostics for support:** ask reporting users to copy
  the `Connection details` panel content from the recovery notice. That
  panel intentionally avoids sensitive data and is exactly what triage
  needs.

If the synthetic probe red-lines while `/api/health` is green, the most
likely causes are: nginx upgrade headers misconfigured, CloudFront WS
behavior disabled, or the EC2 security group blocking the upgrade port.
Those are configuration regressions; check the latest CDK diff first.

## When the container is gone

Worst-case recovery for the EC2 path:

1. Re-run the latest successful **Deploy to AWS** workflow from the Actions
   tab. This re-pushes the most recent ECR image tag and re-issues the SSM
   restart.
2. If the EC2 instance itself is gone, redeploy the CDK stack from
   `cdk/` — the bootstrap script idempotently re-installs the systemd unit
   and Docker. Active rooms are lost; that is expected.
3. CloudFront keeps serving the static SPA shell from cache during the
   outage, which is why users see the app load but realtime fail. The
   client's recovery UX (Retry, compatibility mode, diagnostics panel)
   surfaces the failure cleanly without a backend change.

Plain-Docker recovery is the same shape minus AWS:

```
docker pull wleonhardt/yasp:main
docker stop yasp || true
docker rm yasp || true
docker run -d --restart unless-stopped --name yasp -p 3001:3001 wleonhardt/yasp:main
curl -fsS http://127.0.0.1:3001/api/health
```

## Maintenance log

Operational events worth recording (cert rotations, capacity changes,
incident postmortems) belong as dated bullets in
[`plans/next-up.md`](../plans/next-up.md) under `## Done`. There is no
separate ops log; the planning queue is the timeline.
