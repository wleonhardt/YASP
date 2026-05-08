# Scaling & Redis State

```
  ┌─────────────────────────────────────────────────────────────────┐
  │                                                                 │
  │   TL;DR:  YASP runs fine as a single container.                │
  │           Redis mode exists but is still single-instance.      │
  │           True horizontal scale is future work.                │
  │                                                                 │
  └─────────────────────────────────────────────────────────────────┘
```

This document answers one focused question: what does the optional
Redis-backed mode actually do — and what does it still not do?

---

## Supported Profiles Today

### `memory` — the default

```
  Single app instance
  Active rooms stored in process memory
  No external dependencies
  Restart clears active rooms  (intentional — ephemeral by design)
```

### `redis` — opt-in

```
  YASP_STATE_BACKEND=redis  +  REDIS_URL=...

  Stores active room state + socket-session ownership in Redis
  Uses TTL only — no history, archive, replay, or audit keys
  Still operationally single-instance
```

Redis mode moves ephemeral active state out of the process so a restart
doesn't drop in-flight rooms. It is not the same thing as horizontal scaling.

---

## What Redis Mode Supports Today

After ADR 0003 / Phase 3, Redis mode handles the full real-room workflow
on a single app instance:

```
  create room           join room             reconnect / latest-tab-wins
  vote · reveal         reset · next round    moderator transfer
  room settings         stale-participant cleanup
  TTL-backed room expiry / empty-room cleanup
```

Backend selection lives in the composition root:

- Memory mode uses the original synchronous services
- Redis mode uses async adapters over the same room-domain rules

Room behavior is centralized in `RoomService` regardless of backend.

---

## What Redis Mode Does Not Provide

Redis stores only TTL-bound active state. It does **not** add:

```
  ✗  room history          ✗  saved rounds
  ✗  archives              ✗  replay
  ✗  audit logs            ✗  user accounts
  ✗  authentication        ✗  analytics storage
  ✗  durable vote storage
```

---

## Redis Key Model

```
  yasp:room:{roomId}       active room state          (with TTL)
  yasp:session:{socketId}  active socket-session map  (with TTL)
```

No `history`, `archive`, `replay`, or long-term keys exist.

---

## Why YASP Is Still Not Horizontally Scalable

```
  ┌─────────────────────────────────────────────────────────────────┐
  │  What is still missing before honest multi-instance support:   │
  │                                                                 │
  │  ◻  Socket.IO Redis adapter / cross-node event fanout          │
  │  ◻  Distributed timer completion ownership                     │
  │  ◻  Distributed cleanup ownership                              │
  │  ◻  Accepted cross-instance write coordination                 │
  └─────────────────────────────────────────────────────────────────┘
```

Multiple app nodes pointed at the same Redis today would be outside the
supported deployment model — race conditions on room writes, timer events,
and cleanup are unresolved.

---

## Deployment Stance

The default AWS/CDK deployment path is memory-only by design.

Why Redis mode is not the default operator story:

- It provides operator/infrastructure value, not direct end-user value
- It should not outrank product simplicity, UX, or runtime stability
- Wiring Redis into default deployment docs too early implies scaling
  maturity YASP doesn't yet have

That is why:

- Default runtime stays `memory`
- AWS/CDK path remains memory-only
- First-class Redis deployment docs are intentionally deferred until Phase 4
  work is complete enough to support the claim honestly

Phase 4 becomes worth prioritizing when operator requirements justify it:

```
  →  rolling deploys without losing active rooms
  →  meaningful concurrent traffic beyond one instance
  →  hosting targets requiring multiple app instances
  →  higher availability requirements than a single container provides
```

---

## Relevant ADRs

| ADR | Decision |
|---|---|
| [0001](../plans/decisions/0001-ephemeral-horizontal-scaling-seams.md) | Introduced the seam work |
| [0002](../plans/decisions/0002-redis-backed-state-prototypes.md) | Added Redis-backed state prototypes |
| [0003](../plans/decisions/0003-redis-runtime-wiring-single-instance-profile.md) | Made Redis runtime operational in single-instance profile |
| [0004](../plans/decisions/0004-keep-default-deployments-memory-only-until-redis-scale-out-is-real.md) | Keeps default memory-only; defers multi-instance Redis |

---

## Validation Coverage

Redis mode is validated in two layers:

- Fast contract coverage using `ioredis-mock`
- Live Redis contract + runtime integration coverage in CI

See [docs/redis-integration-testing.md](./redis-integration-testing.md).
