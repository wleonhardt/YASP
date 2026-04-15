# YASP Security Threat Model

**Scope:** Yet Another Scrum Poker (YASP) — realtime Socket.IO scrum poker app.  
**Architecture under review:** Single Node.js process, default in-memory active
room state, optional TTL-bound Redis-backed active-state profile, no durable
database/history layer, no auth. Served via CloudFront → EC2 nginx → container
on port 3001.  
**Audit date:** 2026-04-13  
**Post-remediation update:** 2026-04-13

## 0. Review basis

This threat model is anchored to the repo-managed architecture as it exists today:

- `shared/src/events.ts` and `shared/src/types.ts` define the public protocol surface.
- `server/src/index.ts`, `server/src/config.ts`, and `server/src/services/*`
  implement a single-process room runtime with backend-selected active state
  (`memory` by default, optional TTL-bound Redis-backed active state).
- `cdk/lib/yasp-stack.ts` and `cdk/lib/ec2-origin-bootstrap.ts` define the CloudFront → EC2 → nginx → container deployment path.
- GitHub Actions publish Docker images and deploy through ECR/SSM/systemd.

This model deliberately does **not** assume hidden controls that the repo does not implement:

- no real user authentication
- no origin-bound/browser-bound session secrets
- no durable database-backed recovery/auditability
- no horizontal scaling
- no cryptographic vote sealing

## 1. System summary

YASP is a minimalist, no-account scrum-poker tool. Users create a room, share a room URL, vote on cards, reveal votes, reset, and move to the next round.

**Transport:** Socket.IO over same-origin HTTP/WebSocket, behind Fastify.

**Identity model after remediation:**  
The browser stores a client-generated UUID v4 `sessionId` in localStorage. The server uses that private `sessionId` only as a room continuity token for reconnects and same-browser refresh continuity. Public room state exposes a separate random public `participantId`.

- `sessionId` = private continuity token, client-owned, bearer-style.
- `participantId` = public room participant identifier, safe to show peers.
- `room.participants` is keyed internally by `sessionId`.
- votes and moderator references use public participant IDs.

**Trust model:**  
The `sessionId` is not proof of personhood or account ownership. It only proves possession of a browser continuity token. YASP can answer “does this socket have the continuity token this room saw before?” It cannot answer “is this the same authenticated person?” because the product intentionally has no authentication.

## 2. Assets worth protecting

| Asset | Sensitivity | Why it matters |
|---|---|---|
| Room integrity | Medium | A compromised room wastes a team meeting and can disrupt estimates. |
| Pre-reveal vote secrecy | Medium | Hidden votes are the core product promise. |
| Moderator action integrity | Medium | Moderator controls reveal/reset/deck/transfer/timer flow. |
| Session continuity | Low-Medium | A stolen `sessionId` inherits one client’s continuity context. |
| Service availability | Medium | Single small instance serves all active rooms. |
| Deployment secrets | High | Deploy path can update production images/instances. |
| Browser safety | Medium | User-supplied names/card labels are rendered to peers. |
| Room-link privacy | Low by design | Room URL is a bearer-style meeting link. |
| Origin privacy | Low | Direct origin access should be blocked by nginx/shared origin secret. |

## 3. Trust boundaries

```text
Browser
  - untrusted user input
  - localStorage sessionId
  - Socket.IO / HTTPS
        ↓
CloudFront
  - WAF / basic-auth edge deterrence if enabled
  - injects origin secret header
        ↓ HTTP
EC2 nginx
  - rejects missing/wrong origin secret
  - appends forwarded headers
  - proxies to loopback only
        ↓ loopback
Node container
  - Fastify HTTP + Socket.IO
  - server-authoritative RoomService + selected active-state store
  - validation / permission checks / rate shaping
```

Important post-remediation trust controls:

- public participant IDs are no longer private session tokens
- production trusts exactly two proxy hops for IP extraction under the documented CloudFront → nginx → Node chain
- in-process rate and resource shapers limit abuse
- container runtime is non-root with read-only rootfs and dropped capabilities
- browser responses include CSP and hardening headers

## 4. Attacker profiles

| Profile | Typical abilities | In scope? |
|---|---|---|
| Casual griefer | Knows room URL and joins normally | Yes |
| Malicious participant | Sends crafted Socket.IO events | Yes |
| Room-code guesser | Attempts to enumerate active rooms | Yes |
| Spammer / DoSer | Opens many sockets, sends bursts, oversized payloads | Yes |
| SessionId thief | Obtains a victim’s local token from that victim’s browser/device | Yes |
| XSS / stored-XSS attempter | Injects HTML/JS through names/card labels/future title | Yes |
| Origin bypass attacker | Scans EC2 origin directly | Yes |
| Supply-chain attacker | Compromises dependency, action, Docker registry, base image | Yes |
| Deploy-path attacker | Gains GitHub/AWS/Docker credentials | Yes |
| Authenticated account attacker | Not applicable: no accounts | No |
| Nation-state/APT | Beyond realistic scope | Out of scope |

## 5. Abuse goals

1. Observe pre-reveal votes.
2. Force moderator actions or impersonate a moderator.
3. Spoof another participant’s session continuity.
4. Crash or slow the Node process.
5. Abuse `/api/client-error` as a log/cost amplifier.
6. Inject executable content into peer browsers.
7. Enumerate active rooms.
8. Bypass CloudFront/nginx origin protection.
9. Ship a malicious image through the deploy pipeline.

## 6. Explicit non-goals / accepted risks

These are not currently treated as bugs. They are product and deployment tradeoffs.

1. **No authentication.** Anyone with a room URL can join.
2. **Room URLs are bearer-style links.** Treat them like meeting links.
3. **`sessionId` is continuity, not identity proof.** It is intentionally client-generated and browser-stored.
4. **A client’s own `sessionId` remains sensitive.** XSS or local compromise of that browser can still steal it.
5. **No durable persistence or history.** In `memory` mode, restart destroys
   active rooms. The optional Redis mode only retains TTL-bound active
   room/session state and does not add history/archive semantics.
6. **No historical audit trail across restarts.** Runtime logs exist, but room
   history is not persisted.
7. **Single-instance supported deployment only.** Optional Redis state does not
   yet make YASP safe for multi-instance fanout/timer/cleanup coordination.
8. **Votes are not cryptographically sealed.** The operator can inspect process memory.
9. **CloudFront → origin uses HTTP plus shared-secret header, not mTLS.**
10. **Docker Hub remains a public image distribution channel and intermediate registry.**
11. **Base image digest pinning is deferred.**
12. **Determined DDoS is out of scope beyond WAF and in-process shaping.**

If YASP later adds accounts, persistence, exports, integrations, or stronger identity claims, these risks must be re-opened.

## 7. Current mitigations after remediation

| Risk area | Current mitigation |
|---|---|
| Peer session takeover via public room state | Public participant IDs are separate from private `sessionId` values |
| Room/code guessing | crypto room IDs, longer generated IDs, WAF/rate limits |
| Malformed session IDs | UUID v4 validation |
| Socket event floods | per-socket and per-IP event limits |
| Too many connections | per-IP connection cap |
| Oversized Socket.IO payloads | 16 KB buffer cap and deflate disabled |
| Room-creation memory abuse | global room cap, per-session moderator cap, shorter TTL for never-active rooms |
| Participant growth | room participant cap |
| Timer abuse | bounded auto-reveal delay, room-level and per-participant honk cooldowns |
| Client-error log abuse | body limit, per-IP/global rate limit, strict whitelist sanitization, URL redaction |
| XFF spoofing under expected ingress | production trusted-proxy hop count set to 2 |
| Browser hardening | CSP, frame-ancestors, referrer policy, permissions policy, Helmet defaults |
| Container compromise blast radius | non-root user, read-only rootfs, dropped capabilities, no-new-privileges, resource caps |
| Failed deploys | automatic image rollback attempt on health-check failure |
| Dependency drift | Dependabot present |

## 8. Out of scope for this threat model

- TLS/cipher review beyond CloudFront defaults.
- AWS IAM trust-policy verification outside repo-managed code.
- Runtime dynamic fuzzing of every Socket.IO event.
- Formal penetration testing.
- Compliance frameworks such as SOC 2, HIPAA, PCI.
- mTLS origin hardening.
- Multi-instance/high-availability architecture.
- End-to-end cryptographic vote secrecy.

## 9. Re-run triggers

Re-run this threat model before shipping any of these changes:

- accounts/login/authentication
- persistent room history
- exports or Jira/integration features
- multi-instance deployment
- true multi-instance Redis deployment or durable database adoption
- file uploads or rich text/markdown
- public admin dashboard
- cross-origin API access
- stronger claims about identity or privacy
- change from CloudFront → EC2/nginx ingress topology
