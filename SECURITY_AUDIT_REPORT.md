# YASP Security Audit Report

**Audit date:** 2026-04-13  
**Post-remediation update:** 2026-04-13  
**Branch:** `main`  
**Scope:** See `SECURITY_THREAT_MODEL.md`.

## Executive summary

YASP is a lightweight, no-account, ephemeral scrum-poker app. Its security
model is intentionally modest: room URLs behave like bearer-style meeting
links, `sessionId` is a browser continuity token rather than authentication,
and YASP still provides no durable history/archive layer. The default runtime
keeps active room state in a single in-memory Node process; an optional
Redis-backed profile now exists for TTL-bound active room/session state, but it
remains operationally single-instance and is not yet a claim of true
multi-instance readiness.

The original audit identified one Critical finding: **F-01**, where public participant IDs were equal to private `sessionId` values and were broadcast to peers. That issue has now been remediated by separating private session continuity tokens from public participant IDs.

After the A–G remediation sequence, the current practical posture is:

- **No open Critical or High findings are known from this audit package.**
- The original Critical room/session takeover issue has been fixed.
- The main abuse paths identified by the audit are now shaped with in-process limits.
- Browser hardening headers and CSP are enabled.
- The EC2 Docker runtime is substantially hardened.
- Deployment rollback behavior is safer.
- Layered CI/security scanning exists and is documented in
  `docs/security-scanning.md`.
- Remaining items are accepted product tradeoffs or future hardening, not urgent blockers.

This report still does **not** claim that YASP provides real user authentication. It does not. Anyone with a room URL can attempt to join, and a client’s own `sessionId` remains a bearer-style continuity token stored in the browser.

## Legend

- **Severity**
  - **Critical** — direct session/moderator takeover, RCE, secret disclosure, or guaranteed outage.
  - **High** — cross-participant impact or easy-to-trigger service-wide DoS.
  - **Medium** — meaningful abuse or resource risk with bounded impact.
  - **Low** — defense-in-depth or low-exploitability hardening issue.
  - **Info** — documentation, hygiene, accepted tradeoff, or future hardening only.

- **Current status**
  - **Remediated** — fixed by PR A–G or pre-audit hardening.
  - **Accepted risk** — intentionally retained product/deployment tradeoff.
  - **Future hardening** — useful optional improvement, not required to operate the current product boundary.

## Post-remediation summary

### Shipped remediation sequence

| PR | Result |
|---|---|
| Pre-audit hardening | Crypto room IDs, UUID v4 session validation, per-socket event rate limit, `autoRevealDelayMs` cap, `/api/client-error` per-IP rate limit, Helmet baseline, participant cap, EC2 instance ID default removal, Dependabot |
| PR A | Decoupled public participant IDs from private `sessionId` values |
| PR B | Added DoS/resource-exhaustion shapers: Socket.IO buffer cap, no deflate, per-IP event and connection caps, room caps, short TTL for abandoned rooms, client-error body limit |
| PR C | Added trusted proxy/IP handling and strict `/api/client-error` sanitization/redaction/global cap |
| PR D | Hardened Docker runtime: non-root container, Docker healthcheck, read-only rootfs, tmpfs `/tmp`, dropped caps, `no-new-privileges`, pids/memory/CPU limits |
| PR E | Enabled CSP and browser security headers |
| PR F | Added custom deck label cap, future room title validator, and per-participant honk cooldown |
| PR G | Added deploy rollback path and AWS role session naming; kept Docker Hub intermediate as documented accepted tradeoff |

## Review basis and evidence boundaries

This package is anchored to the repo-managed YASP architecture:

| Fact used by this audit | Repo evidence |
|---|---|
| Single-process Node/Fastify + Socket.IO runtime with default in-memory state and an optional TTL-bound Redis-backed active-state profile; no durable database/history layer | `server/src/index.ts`, `server/src/services/room-store.ts`, `server/src/services/room-service.ts`, `server/src/config.ts` |
| No account/login/identity-provider concept | `shared/src/events.ts`, `shared/src/types.ts`, client room/join flows |
| Client-generated `sessionId` supports reconnect continuity | `shared/src/events.ts`, `server/src/transport/validators.ts`, `server/src/services/room-service.ts` |
| Public participant IDs are now separate from private `sessionId` values | `server/src/domain/types.ts`, `server/src/services/room-service.ts`, `server/src/transport/serializers.ts` |
| CloudFront fronts EC2 nginx origin | `cdk/lib/yasp-stack.ts`, `cdk/lib/ec2-origin-bootstrap.ts` |
| Container deploy path uses GitHub Actions, Docker Hub, ECR, and SSM/systemd restart | `.github/workflows/docker-publish.yml`, `.github/workflows/deploy-aws.yml` |

### Non-claims

This audit does not claim:

- YASP authenticates users or devices.
- Room URLs are secret beyond bearer-link secrecy.
- The current npm lockfile is CVE-free without a live dependency-intelligence run.
- AWS IAM trust policies or deployed CloudFront runtime state were verified outside repo-managed IaC/workflows.
- YASP is resilient to determined DDoS beyond CloudFront/WAF and in-process shaping.

## Coverage matrix

| Review area | Status after remediation |
|---|---|
| Threat model | Complete for current product boundary |
| App/server/socket abuse analysis | Remediated where urgent; future broadcast-amplification profiling remains optional |
| Input validation/resource exhaustion | Main practical gaps remediated |
| Client/browser hardening | CSP/security headers shipped; future client sink audit optional |
| Deployment/workflow security | Runtime hardening and rollback shipped; Docker Hub intermediate accepted |
| Dependency/supply-chain review | Dependabot present; audit/triage policy remains future hardening |
| Accepted-risk documentation | Updated and retained |
| Remediation plan | A–G shipped or intentionally deferred with rationale |

## Current disposition summary

| Bucket | Current items |
|---|---|
| Open Critical / High findings | None known from this audit package |
| Remediated findings | F-01, F-02, F-03, F-04, F-05, F-06, F-07, F-08, F-10, F-11, F-13, F-14, F-15 partially, F-16, F-17, F-18 partially, F-22 |
| Accepted risks | F-19, F-21, plus threat-model non-goals |
| Future hardening | F-09, F-12, F-15 digest pinning, F-18 IAM trust-policy verification, F-20, optional F-19 digest verification / ECR-direct path |

## Findings

### F-01 · Participant identifier equals sessionId and is broadcast to peers

**Original severity:** Critical  
**Current status:** Remediated  
**Layer:** Server logic / Socket.IO model

**Original issue:** Public participant IDs were equal to private `sessionId` values and were broadcast in `room_state`, allowing a participant to copy another user’s session continuity token and reconnect as them.

**Remediation:** PR A decoupled private session continuity from public participant identity.

Current model:

- `Participant.sessionId` is private/internal and used for reconnect continuity.
- `Participant.id` is a public random participant ID.
- `room.participants` is keyed by private `sessionId`.
- votes, `moderatorId`, and `previousModeratorId` use public participant IDs.
- `PublicParticipant.id` exposes only the public ID.
- each caller still receives only their own `me.sessionId` for reconnect continuity.

**Residual risk:** If a client suffers XSS or local compromise, that client’s own `me.sessionId` can still be stolen. That is an accepted consequence of the no-auth, browser-continuity model, not a peer leak.

---

### F-02 · Custom deck label had no length cap; dormant room.title needed canonical validation

**Original severity:** Low  
**Current status:** Remediated  
**Layer:** Input validation

**Remediation:** PR F added:

- `MAX_CUSTOM_DECK_LABEL_LENGTH = 60`
- validation that rejects overlong custom deck labels
- `MAX_ROOM_TITLE_LENGTH = 60`
- `validateRoomTitle` / `sanitizeRoomTitle` helpers for any future room-title feature

No room-title UI or socket event was added.

---

### F-03 · Room creation/resource exhaustion

**Original severity:** Medium  
**Current status:** Remediated  
**Layer:** Resource exhaustion / Socket.IO abuse

**Remediation:** PR B added:

- `MAX_ACTIVE_ROOMS = 10_000`
- `MAX_ROOMS_MODERATED_PER_SESSION = 5`
- `EMPTY_ROOM_TTL_MS = 5 minutes` for never-active rooms
- room activity tracking via `hasBeenActive`

Normal create/join/vote/reconnect flows remain unchanged below the limits.

---

### F-04 · `/api/client-error` log abuse

**Original severity:** Medium  
**Current status:** Remediated  
**Layer:** Logging / input validation

**Remediation:** PR C added strict `/api/client-error` normalization:

- whitelisted fields only
- control-character stripping
- newline/tab normalization where appropriate
- bounded message/stack/user-agent sizes
- URL and referer query/fragment redaction
- raw `X-Forwarded-For` and raw header user-agent no longer logged
- global client-error ceiling of 200 reports/minute
- log level demoted to `warn`

PR B also added a route-scoped 32 KB body limit.

---

### F-05 · Socket.IO limiter was per-socket only

**Original severity:** Medium  
**Current status:** Remediated  
**Layer:** Socket.IO abuse / resource exhaustion

**Remediation:** PR B added per-IP event limiting alongside the per-socket limiter:

- `SOCKET_RATE_MAX_EVENTS_PER_SOCKET = 50 / 5s`
- `SOCKET_RATE_MAX_EVENTS_PER_IP = 500 / 5s`

PR C hardened IP resolution for the documented CloudFront → nginx → Node proxy chain.

---

### F-06 · `X-Forwarded-For` trusted without proxy-chain validation

**Original severity:** Medium  
**Current status:** Remediated for documented deployment topology  
**Layer:** Input validation / trust boundary

**Remediation:** PR C added a trust-hop model:

- production default `YASP_TRUSTED_PROXY_HOPS = 2`
- Fastify uses `trustProxy: 2`
- Socket.IO uses matching right-to-left trust-boundary IP extraction
- development/tests default to trust count `0`

**Caveat:** This is valid for the documented `viewer → CloudFront → EC2 nginx → Node` chain. If the ingress path changes, `YASP_TRUSTED_PROXY_HOPS` must be re-audited.

---

### F-07 · Socket.IO `maxHttpBufferSize` and compression defaults

**Original severity:** Medium  
**Current status:** Remediated  
**Layer:** Resource exhaustion

**Remediation:** PR B added:

- `SOCKET_MAX_HTTP_BUFFER_SIZE = 16_384`
- `perMessageDeflate: false`

Transports were not restricted to WebSocket-only to avoid unnecessary compatibility risk.

---

### F-08 · CSP / browser security headers

**Original severity:** Low  
**Current status:** Remediated  
**Layer:** Browser hardening

**Remediation:** PR E enabled CSP and headers.

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

Additional headers include:

- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=()`
- Helmet defaults such as `X-Content-Type-Options: nosniff`

**Caveat:** `style-src 'unsafe-inline'` remains intentionally allowed. `script-src` stays strict (`'self'`, no inline/eval), which is the key XSS-relevant axis.

---

### F-09 · Full room-state broadcast on every event

**Original severity:** Low  
**Current status:** Future hardening  
**Layer:** Resource amplification

The app still broadcasts full room snapshots rather than deltas. This is acceptable today with participant caps and rate limits in place.

**Future option:** measure first; only introduce deltas/coalescing if profiling shows real pressure.

---

### F-10 · Honk cooldown was room-level only

**Original severity:** Low  
**Current status:** Remediated  
**Layer:** Socket.IO abuse / UX annoyance

**Remediation:** PR F added:

- `PARTICIPANT_HONK_COOLDOWN_MS = 2_000`
- server-internal `Participant.lastHonkAt`

The existing room-level cooldown remains dominant under current moderator-only policy.

---

### F-11 · `/api/client-error` referer/user-agent logging hygiene

**Original severity:** Low  
**Current status:** Remediated  
**Layer:** Privacy / logging hygiene

**Remediation:** PR C redacts referer query strings/fragments, sanitizes/caps user agent, and stops logging raw forwarded headers.

---

### F-12 · SPA fallback/static caching

**Original severity:** Low  
**Current status:** Future hardening  
**Layer:** Browser/static serving

No issue today. Revisit hashed-asset caching if CloudFront caching is enabled for `/assets/`.

---

### F-13 · `/api/client-error` bodyLimit default

**Original severity:** Low  
**Current status:** Remediated  
**Layer:** Resource exhaustion

**Remediation:** PR B added route-scoped `CLIENT_ERROR_BODY_LIMIT = 32_768`.

---

### F-14 · Docker image ran as root

**Original severity:** Medium  
**Current status:** Remediated  
**Layer:** Docker/runtime

**Remediation:** PR D updated the production Docker image to run as the built-in `node` user.

---

### F-15 · Docker image/runtime polish

**Original severity:** Low  
**Current status:** Partially remediated / partially deferred  
**Layer:** Docker/supply chain

Remediated:

- Docker `HEALTHCHECK` added using Node’s built-in HTTP client.
- runtime read-only rootfs and tmpfs guidance is now implemented in EC2 `docker run`.
- PID 1 behavior remains acceptable because the Node server has shutdown handling.

Deferred:

- base image digest pinning. This remains a future hardening item because tag tracking is easier to maintain with Dependabot for YASP’s threat profile.

---

### F-16 · EC2 `docker run` lacked hardening flags

**Original severity:** Medium  
**Current status:** Remediated  
**Layer:** Docker/runtime

**Remediation:** PR D added:

```text
--read-only
--tmpfs /tmp:rw,nosuid,nodev,size=64m
--cap-drop ALL
--security-opt no-new-privileges
--pids-limit 256
--memory 512m
--memory-swap 512m
--cpus 1.0
```

Loopback publish and CloudWatch `awslogs` remain intact.

---

### F-17 · Deploy workflow had no rollback path

**Original severity:** Low  
**Current status:** Remediated  
**Layer:** Deployment reliability

**Remediation:** PR G captures the previous `IMAGE_IDENTIFIER` before mutation. If health checks fail after restart, the workflow restores the previous image, restarts the systemd unit, re-checks health, and still exits non-zero so the attempted deployment is visible.

---

### F-18 · OIDC workflow traceability / IAM trust verification

**Original severity:** Info  
**Current status:** Partially remediated / future operational verification  
**Layer:** CI/CD

Remediated:

- PR G added `role-session-name: gh-deploy-yasp-<run_id>` for CloudTrail traceability.

Still requires operator verification outside this repo:

- confirm AWS IAM trust policy restricts GitHub OIDC `sub` to the intended repo, branch, and environment.

---

### F-19 · Docker Hub used as intermediate registry

**Original severity:** Low  
**Current status:** Accepted risk  
**Layer:** Supply chain

Docker Hub remains the public image distribution surface. Production still runs from ECR after a GitHub OIDC-authenticated deploy path.

This remains accepted because removing Docker Hub would be product-visible and not strictly required for the current threat model.

Future hardening option:

- propagate and verify image digests between publish/deploy workflows
- or push directly to ECR if public Docker Hub distribution becomes unnecessary

---

### F-20 · Dependency triage policy

**Original severity:** Info  
**Current status:** Future hardening  
**Layer:** Supply chain

Dependabot exists. Future optional work:

- add `npm audit --production` / high-severity audit gate if noise is acceptable
- optionally auto-merge low-risk dev/patch dependency updates behind green CI

---

### F-21 · Dev CORS posture

**Original severity:** Info  
**Current status:** Accepted risk / no production issue  
**Layer:** Browser hardening

Production remains same-origin only. Development CORS for local Vite is acceptable.

---

### F-22 · No connection-level cap

**Original severity:** Low  
**Current status:** Remediated  
**Layer:** Resource exhaustion

**Remediation:** PR B added `MAX_SOCKET_CONNECTIONS_PER_IP = 20`.

## Findings by current status

| Status | Count | IDs |
|---|---:|---|
| Remediated | 17 | F-01, F-02, F-03, F-04, F-05, F-06, F-07, F-08, F-10, F-11, F-13, F-14, F-16, F-17, F-22 plus F-15/F-18 partially |
| Accepted risk | 2 | F-19, F-21 |
| Future hardening | 5 | F-09, F-12, F-15 digest pinning, F-18 IAM trust verification, F-20 |
| Open Critical / High | 0 | — |

## Accepted risks

These remain acceptable for the current YASP product boundary:

1. Room URLs remain bearer-style links.
2. YASP has no accounts or login.
3. `sessionId` remains a client-side continuity token, not identity proof.
4. YASP still has no durable room history/archive. In `memory` mode, restarting
   the app clears active rooms; the optional Redis mode only retains TTL-bound
   active room/session state and does not add history.
5. YASP remains single-instance in supported deployments. The optional
   Redis-backed mode is still not safe multi-instance fanout/coordination.
6. Votes live in process memory; operators are trusted.
7. CloudFront → origin remains HTTP plus shared-secret header, not mTLS.
8. Docker Hub remains a public distribution channel and intermediate registry.
9. Base image digest pinning is deferred.

If YASP later adds accounts, persistence, integrations, or stronger identity claims, these risks must be reclassified.

## What this post-remediation audit still does not cover

- Live AWS/IAM trust-policy verification.
- Runtime Socket.IO fuzzing against a deployed server.
- Live npm/CVE intelligence beyond repository dependency posture.
- TLS/cipher review beyond CloudFront defaults.
- Formal penetration testing.
- Compliance frameworks.

## Recommended next security steps

1. Confirm AWS IAM OIDC trust policy restricts `sub` to the intended repo/branch/environment.
2. Periodically run dependency audits and review Dependabot PRs.
3. Consider digest verification between Docker publish and deploy workflows if Docker Hub trust becomes a concern.
4. Re-run the threat model if YASP adds accounts, persistence, multiple instances, Jira integrations, or exports.
5. Consider broadcast coalescing/deltas only if profiling shows real pressure.
