# YASP Security Remediation Plan

**Companion to:** `SECURITY_AUDIT_REPORT.md`  
**Audit date:** 2026-04-13  
**Post-remediation update:** 2026-04-13

This plan groups the audit findings into shippable work. PRs A–G have now shipped or been intentionally deferred with documented rationale.

## Guardrails

This plan hardens the existing YASP architecture:

- no accounts/auth
- no durable database/history/archive layer
- optional Redis-backed active room/session state only
- default deployment/profile remains single-instance memory mode
- single Docker container deployment
- lightweight EC2/CloudFront deployment path

It intentionally does not turn YASP into a different product.

Current blocking vs advisory CI/security lanes are documented in
[`docs/security-scanning.md`](./docs/security-scanning.md).

## Current remediation status

| PR / workstream | Status | Findings |
|---|---|---|
| Pre-audit hardening | Shipped | crypto room IDs, UUID session validation, per-socket rate limit, auto-reveal cap, client-error per-IP rate limit, Helmet baseline, participant cap, EC2 ID scrub, Dependabot |
| PR A | Shipped | F-01 |
| PR B | Shipped | F-03, F-05, F-07, F-13, F-22 |
| PR C | Shipped | F-04, F-06, F-11 |
| PR D | Shipped | F-14, F-16, low-risk F-15 |
| PR E | Shipped | F-08 |
| PR F | Shipped | F-02, F-10 |
| PR G | Shipped / partial | F-17, F-18 session name, F-19 documented accepted risk, F-15 digest pinning deferred |

## Already landed before the main remediation sequence

These were complete before the post-audit PR sequence and are now treated as baseline:

- cryptographic room IDs
- UUID v4 `sessionId` validation
- per-socket Socket.IO event limiter
- `autoRevealDelayMs` capped at 30 seconds
- `/api/client-error` per-IP rate limit
- Helmet baseline registration
- participant cap per room
- removal of hardcoded EC2 instance ID default
- Dependabot config

## Priority 0 — Critical fix

### PR A · Decouple public participantId from private sessionId — shipped

**Fixed:** F-01

The public room state no longer exposes private peer `sessionId` values.

Current identity model:

- `Participant.sessionId` is the private continuity token.
- `Participant.id` is the public participant ID.
- `room.participants` is keyed by `sessionId`.
- votes and moderator references use public participant IDs.
- `PublicParticipant.id` exposes only the public ID.
- each caller still receives only their own `me.sessionId`.

Result: peer-visible room state no longer contains another participant’s continuity token.

## Priority 1 — Abuse/resource hardening

### PR B · DoS / resource-exhaustion shapers — shipped

**Fixed:** F-03, F-05, F-07, F-13, F-22

Shipped limits:

```ts
EMPTY_ROOM_TTL_MS                  = 5 * 60_000
MAX_ACTIVE_ROOMS                   = 10_000
MAX_ROOMS_MODERATED_PER_SESSION    = 5
MAX_SOCKET_CONNECTIONS_PER_IP      = 20
SOCKET_RATE_WINDOW_MS              = 5_000
SOCKET_RATE_MAX_EVENTS_PER_SOCKET  = 50
SOCKET_RATE_MAX_EVENTS_PER_IP      = 500
SOCKET_MAX_HTTP_BUFFER_SIZE        = 16_384
CLIENT_ERROR_BODY_LIMIT            = 32_768
```

Other shipped changes:

- disabled Socket.IO `perMessageDeflate`
- route-scoped 32 KB `/api/client-error` body cap
- short TTL for never-active abandoned rooms
- per-IP connection cap and per-IP event cap

### PR C · Trusted IP handling + client-error sanitization — shipped

**Fixed:** F-04, F-06, F-11

Shipped behavior:

- production trusts exactly two proxy hops for the documented `viewer → CloudFront → nginx → Node` chain
- development/tests default to no proxy trust
- Socket.IO and Fastify use matching trusted-IP semantics
- `/api/client-error` uses strict whitelist normalization
- control characters are stripped/normalized
- URL/referer fields drop query strings and fragments
- raw forwarded headers are not logged
- global `/api/client-error` ceiling: 200/minute
- client-error logs use `warn` instead of `error`

Caveat: if the deployment proxy chain changes, `YASP_TRUSTED_PROXY_HOPS` must be re-audited.

### PR D · Docker/runtime hardening — shipped

**Fixed:** F-14, F-16, low-risk F-15

Shipped behavior:

- production container runs as `node`, not root
- Docker `HEALTHCHECK` probes `/api/health`
- EC2 `docker run` includes:
  - `--read-only`
  - `--tmpfs /tmp:rw,nosuid,nodev,size=64m`
  - `--cap-drop ALL`
  - `--security-opt no-new-privileges`
  - `--pids-limit 256`
  - `--memory 512m`
  - `--memory-swap 512m`
  - `--cpus 1.0`

Deferred:

- base image digest pinning. Keep tag-based updates for now because Dependabot maintainability is more valuable at this threat profile.

## Priority 2 — Browser/input hardening

### PR E · CSP + browser security headers — shipped

**Fixed:** F-08

Final CSP:

```text
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
font-src 'self';
img-src 'self' data:;
connect-src 'self';
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none';
```

Additional headers:

- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=()`
- Helmet defaults including `X-Content-Type-Options: nosniff`

`style-src 'unsafe-inline'` remains a deliberate tradeoff. `script-src` remains strict.

### PR F · Input validation + honk hygiene — shipped

**Fixed:** F-02, F-10

Shipped:

- `MAX_CUSTOM_DECK_LABEL_LENGTH = 60`
- `MAX_ROOM_TITLE_LENGTH = 60`
- `validateRoomTitle`
- `sanitizeRoomTitle`
- `PARTICIPANT_HONK_COOLDOWN_MS = 2_000`
- server-internal `Participant.lastHonkAt`

No room-title UI or socket event was added.

## Priority 2/3 — Deployment reliability and supply chain

### PR G · Deployment reliability + supply-chain tradeoff documentation — shipped / partially deferred

**Fixed:** F-17  
**Partially addressed:** F-18, F-19, F-15

Shipped:

- deployment captures previous `IMAGE_IDENTIFIER`
- failed health check triggers rollback to previous image
- workflow still exits non-zero after failed attempted deploy
- AWS credentials step now uses `role-session-name: gh-deploy-yasp-<run_id>`

Documented/accepted:

- Docker Hub remains the public distribution channel and intermediate registry.
- production runtime pulls from ECR only after GitHub OIDC-authenticated deploy work.
- base image digest pinning remains deferred.

Future option:

- pass image digests from publish to deploy and verify before tagging into ECR
- or switch to ECR-direct if public Docker Hub distribution is no longer needed

## Remaining future hardening backlog

| Finding | Status | Future action |
|---|---|---|
| F-09 | Future hardening | Measure full-state broadcast cost; consider deltas/coalescing only if profiling shows pressure |
| F-12 | Future hardening | Revisit hashed-asset caching if CloudFront asset caching is enabled |
| F-15 | Future hardening | Consider base image digest pinning if registry threat profile increases |
| F-18 | Future operational check | Verify AWS IAM OIDC trust policy restricts `sub` to intended repo/branch/environment |
| F-19 | Accepted risk / future hardening | Optionally verify Docker Hub image digest before ECR tag |
| F-20 | Advisory shipped, not yet blocking | CI now runs `npm audit --omit=dev --audit-level=high` on every PR/push with `continue-on-error: true`; output is written to the GitHub Actions step summary. Flip the step to blocking once the audit is reliably clean at high/critical on `main`. Dependabot automerge policy remains optional follow-up. |

## Verification checklist

### Completed remediation verification

- PR A: server tests validated public/private identity split, reconnect continuity, moderator transfer, stale sockets, cleanup.
- PR B: server tests validated connection caps, event caps, room caps, empty-room TTL, and body limit.
- PR C: tests validated trusted IP extraction, spoof resistance, client-error sanitization/redaction, and rate ceilings.
- PR D: script tests validated Dockerfile/user/healthcheck and EC2 docker flags; server tests remained green.
- PR E: tests validated CSP and security headers; production build path was smoke-tested.
- PR F: server tests validated deck label cap, room-title helper, and per-participant honk cooldown.
- PR G: workflow YAML and shell snippets were syntax-checked; rollback logic was reviewed.

### Still recommended operational verification

- Confirm AWS IAM trust policy for the GitHub OIDC deploy role.
- Run a live deploy to verify rollback behavior in the real EC2/SSM environment.
- Confirm `docker inspect yasp` shows the expected runtime flags after redeploy.
- Periodically review Dependabot/security alerts.
- Re-run the security threat model if product scope changes.

## Out-of-scope / intentionally not doing

Do not add in this cycle:

- authentication/accounts
- durable database/history/archive persistence
- multi-instance Redis scaling
- cryptographic vote sealing
- HSTS preload submission
- mTLS between CloudFront and origin
- heavyweight security services

These remain deliberate product decisions for YASP’s current scope.

## Accepted risks that remain

1. Room URL remains a bearer-style link.
2. YASP remains intentionally no-auth.
3. `sessionId` remains a client-side continuity token.
4. YASP still has no durable room history/archive. In `memory` mode, restart
   clears active rooms; the optional Redis profile only retains TTL-bound
   active room/session state and is not a history feature.
5. Single-instance deployment remains the accepted operating model. The
   optional Redis profile is still operationally single-instance only.
6. Votes are not cryptographically sealed against the operator.
7. CloudFront → origin uses HTTP plus shared-secret header, not mTLS.
8. Docker Hub remains a public image distribution channel.
9. Base image digest pinning remains deferred.
10. Determined DDoS remains out of scope beyond WAF and in-process shaping.

If future product direction changes any of these assumptions, re-run the threat model and reclassify the risks.
