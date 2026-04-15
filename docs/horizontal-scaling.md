# Optional Redis-Backed Active State

YASP still defaults to a single-instance in-memory runtime.

This document exists to answer one narrow question: what does the current
optional Redis-backed mode actually do, and what does it still not do?

## Supported profiles today

### `memory` (default)

- Single app instance
- Active rooms stored in process memory
- No external state dependency
- Restarting the app clears active rooms

### `redis` (opt-in)

- Enabled with `YASP_STATE_BACKEND=redis`
- Requires `REDIS_URL`
- Stores active room state plus active socket-session ownership in Redis
- Uses TTL only; no history, archive, replay, or audit keys
- Remains operationally **single-instance**

Redis mode is supported as a way to move active ephemeral state out of process.
It is not yet the same thing as true multi-instance horizontal scaling.

## What Redis mode supports today

After ADR 0003 / Phase 3, Redis mode supports the real room workflow for a
single app instance:

- create room
- join room
- reconnect / latest-tab-wins continuity
- vote / reveal / reset / next round
- moderator transfer
- room settings updates
- stale-participant cleanup
- TTL-backed room expiry / empty-room cleanup

Backend selection stays in the composition root:

- memory mode uses the original synchronous services
- Redis mode uses async adapters over the same room-domain rules

That keeps the behavior model centralized in `RoomService`.

## What Redis mode does not provide

Redis mode does **not** add:

- room history
- saved rounds
- archives
- replay
- audit logs
- user accounts
- authentication
- analytics storage
- durable vote storage

Redis is only approved as TTL-bound active-room/session state.

## Redis key model

Redis currently stores only active ephemeral keys:

- `yasp:room:{roomId}` — active room state with TTL
- `yasp:session:{socketId}` — active socket-session ownership with TTL

There are no `history`, `archive`, `replay`, or long-term analytics keys.

## Why YASP is still not horizontally scalable

The current Redis-backed profile is still **single-instance only**.

What is still missing before YASP can honestly claim safe multi-instance room
serving:

- Socket.IO Redis adapter / cross-node fanout
- distributed timer completion ownership
- distributed cleanup ownership
- accepted cross-instance write coordination

Today, multiple app instances pointed at the same Redis would still be outside
the supported deployment model.

## Relevant ADRs

- [ADR 0001](../plans/decisions/0001-ephemeral-horizontal-scaling-seams.md) —
  introduced the seam work
- [ADR 0002](../plans/decisions/0002-redis-backed-state-prototypes.md) —
  added Redis-backed state prototypes
- [ADR 0003](../plans/decisions/0003-redis-runtime-wiring-single-instance-profile.md) —
  made the Redis-backed runtime operational in a single-instance profile

## Validation coverage

Redis mode is validated in two layers:

- fast contract coverage using `ioredis-mock`
- live Redis contract + runtime integration coverage in CI

See [docs/redis-integration-testing.md](./redis-integration-testing.md).
