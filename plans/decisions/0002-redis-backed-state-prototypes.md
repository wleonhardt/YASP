# ADR 0002: Redis-Backed State Prototypes (Phase 2)

- Status: accepted
- Date: 2026-04-14
- Relates to: ADR 0001

## Context

ADR 0001 introduced server-side seams (`RoomStore`, `SessionBindingStore`,
`ActiveRoomSessionResolver`, `RoomTimerScheduler`, `RoomStatePublisher`) so a
future Redis-backed implementation could plug in without rewriting socket
handlers or room-domain logic. Phase 1 left all implementations in-process
and in-memory.

Phase 2 adds the Redis-backed store prototypes themselves, behind an opt-in
configuration switch, so we can:

- prove the serialization model works end-to-end;
- exercise both implementations against a single contract test suite;
- keep local in-memory mode the default and untouched.

Phase 2 intentionally does not re-plumb `RoomService` onto the async store
interface. That is a larger, RoomService-wide change and belongs in Phase 3.

## Decision

Introduce async counterparts of the Phase 1 store interfaces:

- `AsyncRoomStore`
- `AsyncSessionBindingStore`

Ship two implementations of each:

- `AsyncInMemoryRoomStore` / `AsyncInMemorySessionBindingStore` — thin async
  adapters over the existing sync in-memory stores. Deep-clone rooms on the
  read/write boundary so behavior matches a Redis implementation.
- `RedisRoomStore` / `RedisSessionBindingStore` — prototype Redis-backed
  implementations using `ioredis`.

Add a new configuration switch:

- `YASP_STATE_BACKEND=memory|redis` (default `memory`)
- `REDIS_URL` required only when `backend=redis`

Selection happens only in the composition root (`server/src/index.ts`) via
`createAsyncStateBackend`. For `memory`, nothing changes — `RoomService` is
still constructed with the existing sync `InMemoryRoomStore` and
`InMemorySessionBindingStore`. For `redis`, the factory connects to Redis,
runs a `PING` health check, and then the server refuses to start with a
clear error: _the async-store wiring through `RoomService` is Phase 3
work._ This lets an operator validate Redis connectivity on the intended
cluster without the rest of the Phase 3 machinery.

Redis key model (all ephemeral, no archive, no history):

- `yasp:room:{roomId}` — JSON-encoded `Room`. Maps serialize as arrays of
  tuples. Key TTL is set on every `save` to `max(5s, expiresAt - now + 60s)`.
- `yasp:session:{socketId}` — JSON-encoded `{sessionId, roomId}` binding.
  Hard 24h TTL as a crash-safety net.

A shared contract test suite runs both implementations (the async
in-memory adapter and the Redis prototype backed by `ioredis-mock`) against
identical behavioral expectations, so divergence between backends fails CI.

## Consequences

- Memory mode remains the default and is 100% behavior-identical to before.
- The Redis prototypes exist, are fully testable in CI without an external
  service, and fail fast on misconfiguration.
- `ioredis` is added as a runtime dependency but is **dynamically imported**
  so local / memory-mode deployments never load it.
- `ioredis-mock` is added as a dev dependency for contract-suite coverage.
- The server refuses to start in `redis` mode until Phase 3 wires
  `RoomService` onto the async interfaces. This is intentional: shipping a
  half-wired Redis path would silently desync in-memory state across
  instances.
- Distributed write coordination, timer ownership, stale-participant
  cleanup ownership, and the Socket.IO Redis adapter remain open questions
  (see `plans/open-questions.md`).
- No history, persistence UX, accounts, analytics, or audit logs were
  introduced. Per ADR 0001's ephemeral-only constraint.
