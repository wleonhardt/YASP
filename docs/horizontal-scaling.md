# Optional Horizontal Scaling

YASP runs in local in-memory mode today, and that remains the default.

This document describes the current optional Redis-backed runtime and the
remaining work before YASP can claim true multi-instance horizontal scaling.
Redis is only allowed to act as distributed ephemeral memory.

## Current Modes

### Default: memory

- Single Node.js process
- Active rooms stored in memory
- No database
- No accounts or authentication
- Ephemeral rooms only

### Opt-in: redis

- Enabled with `YASP_STATE_BACKEND=redis`
- Requires `REDIS_URL`
- Stores only active room state and active socket-session ownership in Redis
- Keeps TTL-based expiry only; no history keys or archive keys
- Reuses the same room-domain rules as memory mode through thin async adapters

Memory mode remains the default. Local mode behavior is unchanged.

## What Redis Mode Supports After Phase 3

Phase 3 makes Redis mode operational for authoritative active-room state in a
single app instance:

- create room
- join room
- reconnect
- latest-tab-wins session ownership
- votes
- reveal / reset / next round
- moderator transfer
- settings updates
- stale-participant cleanup
- room expiry / empty-room cleanup using TTL-backed active state

The composition root is the only place that selects the backend. Memory mode
uses the original synchronous services. Redis mode uses the async store path.
Room-domain semantics stay centralized in `RoomService`.

## Redis Data Model

Redis stores only active ephemeral keys:

- `yasp:room:{roomId}` — active room state with TTL
- `yasp:session:{socketId}` — active socket ownership with TTL

There are no history, archive, replay, or audit keys.

## Explicit Non-Goals

Redis mode must not become a persistence feature. It does not add:

- Room history
- Saved rounds
- Audit logs
- Room replay
- User accounts
- Authentication
- Analytics storage
- Durable vote storage

If a future design requires any of those capabilities, it is a separate product
change and needs its own ADR.

## Why Redis Mode Is Not Yet True Horizontal Scaling

Phase 3 intentionally stops short of full multi-instance support.

Redis mode is currently supported as:

- single app instance
- Redis-backed active state

It is not yet supported as:

- multiple app instances attached to the same Redis and all serving the same
  room safely

The remaining blockers are explicit:

- no Socket.IO Redis adapter yet
- no distributed timer completion ownership
- no distributed cleanup ownership
- no accepted cross-instance write-coordination model yet

If multiple app instances are pointed at the same Redis today, room-state keys
may exist centrally, but socket fan-out and cleanup/timer semantics are not
coordinated across nodes. That deployment profile is still out of scope.

## Phase 1 Seams

Phase 1 kept behavior unchanged while isolating the server-side boundaries a
future Redis-backed implementation could plug into:

- `RoomStore`
- `SessionBindingStore`
- `ActiveRoomSessionResolver`
- `RoomTimerScheduler`
- `RoomStatePublisher`

The server composition root still wires only in-memory implementations:

- `InMemoryRoomStore`
- `InMemorySessionBindingStore`
- `InMemoryActiveRoomSessionResolver`
- `InMemoryRoomTimerScheduler`
- `SocketRoomStatePublisher`

## Phase 2 Prototypes

Phase 2 adds the Redis-backed store prototypes behind an opt-in configuration
switch while keeping local in-memory mode the default. See
`plans/decisions/0002-redis-backed-state-prototypes.md` for the scope and
the original non-wiring decision.

- Config switch: `YASP_STATE_BACKEND=memory|redis` (default `memory`)
- Required only when `backend=redis`: `REDIS_URL`
- Redis dependency: `ioredis` (dynamic-imported — not loaded in memory mode)
- New async interfaces: `AsyncRoomStore`, `AsyncSessionBindingStore`
- New implementations:
  - `AsyncInMemoryRoomStore` / `AsyncInMemorySessionBindingStore` — test-only
    adapters over the existing sync stores
  - `RedisRoomStore` / `RedisSessionBindingStore` — Redis-backed prototypes

### Redis Key Model (Phase 2)

- `yasp:room:{roomId}` — JSON-encoded active room. Maps serialize as arrays of
  tuples. Key TTL is set on every `save` to
  `max(5s, room.expiresAt - now + 60s)`.
- `yasp:session:{socketId}` — JSON-encoded `{sessionId, roomId}` binding for a
  single socket. Hard TTL of 24h as a crash-safety net.

There are no `yasp:room:history:*`, `yasp:archive:*`, or any other durable
keys. Redis is used as ephemeral distributed memory only.

## Phase 3 Runtime Wiring

Phase 3 removes the startup refusal and wires Redis mode into the real server
runtime:

- backend selection stays in the composition root
- memory mode keeps the original synchronous path
- Redis mode uses async store-backed adapters
- `AsyncOperationQueue` serializes Redis-backed room mutations within the
  process so the existing room-domain logic can run without mode checks
- cleanup and expiry keep the same ephemeral intent, with Redis room-key TTL
  grace aligned to the cleanup cadence

See `plans/decisions/0003-redis-runtime-wiring-single-instance-profile.md`.

## Still Out Of Scope After Phase 3

- Socket.IO Redis adapter
- Distributed timer ownership / coordination
- Distributed cleanup ownership
- Accepted cross-instance concurrent write coordination (CAS vs coordinator)
- Multi-instance deployment guidance
