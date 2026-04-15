# Optional Horizontal Scaling

YASP runs in local in-memory mode today, and that remains the default.

This document describes the future optional horizontal-scaling direction:
multiple app instances may eventually share the same active room state through
Redis, but Redis is only allowed to act as distributed ephemeral memory.

## Current Mode

- Single Node.js process
- Active rooms stored in memory
- No database
- No accounts or authentication
- Ephemeral rooms only

## Future Optional Redis Mode

Redis mode is not implemented in this phase.

When it is added later, it must preserve the same product model:

- Redis stores only active room, session-binding, and coordination state
- Redis keys expire with TTLs
- Expired rooms disappear instead of being archived
- Local in-memory mode remains available and remains the default

## Benefits Redis Mode May Provide

- Multiple app instances can serve the same active room
- Rolling deploys can lose fewer active rooms
- Failure isolation improves because one instance no longer owns all rooms
- More Socket.IO capacity becomes possible by spreading load across instances

## Explicit Non-Goals

Redis mode must not become a persistence feature. It must not add:

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

## Phase 1 Seams

Phase 1 keeps behavior unchanged while isolating the server-side boundaries a
future Redis-backed implementation can plug into:

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

## Out Of Scope For Phase 1

This phase does not add:

- Redis dependencies
- Redis clients
- Socket.IO Redis adapter
- Distributed locks
- Redis timer coordination
- Redis key schema
- Multi-instance deployment changes
- CDK or infrastructure changes

## Phase 2 Prototypes

Phase 2 adds the Redis-backed store prototypes behind an opt-in configuration
switch while keeping local in-memory mode the default. See
`plans/decisions/0002-redis-backed-state-prototypes.md` for the scope and
explicit non-wiring note.

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

### Phase 2 Non-Wiring

The composition root selects the backend at startup, but RoomService is still
synchronous and is still wired to `InMemoryRoomStore` / `InMemorySessionBindingStore`.
Starting the process with `YASP_STATE_BACKEND=redis` validates connectivity
(connect + PING) and then fails startup with a clear message pointing here.
Re-wiring RoomService onto the async interfaces is Phase 3.

### Still Out Of Scope (Phase 2)

- Socket.IO Redis adapter
- Distributed timer ownership
- Multi-instance concurrent write coordination (CAS vs coordinator)
- Multi-instance deployment changes
- CDK or infrastructure changes
