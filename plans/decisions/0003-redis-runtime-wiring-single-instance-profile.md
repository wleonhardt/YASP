# ADR 0003: Redis Runtime Wiring Uses a Single-Instance Operational Profile

- Status: accepted
- Date: 2026-04-15
- Relates to: ADR 0001, ADR 0002

## Context

ADR 0001 introduced explicit room/session/timer/publisher seams so YASP could
eventually move active room state out of process without changing the product
model. ADR 0002 added async store interfaces plus Redis-backed room/session
store prototypes, but kept `RoomService` and the real runtime on the original
sync in-memory path. In Phase 2, `YASP_STATE_BACKEND=redis` validated
connectivity and then intentionally refused startup.

Phase 3 needs Redis mode to become operational while preserving the
non-negotiables:

- memory mode remains the default;
- Redis remains opt-in;
- Redis stays ephemeral-only;
- no history, archives, audit logs, accounts, or auth;
- no Socket.IO Redis adapter yet;
- no distributed timer or cleanup coordination yet.

We still want one source of room-domain truth. Duplicating the room rules into
parallel sync and async implementations would increase drift risk and make the
Redis rollout harder to reason about.

## Decision

Keep backend selection exclusively in the composition root (`createServerRuntime`).

- Memory mode continues to use the original synchronous services:
  `InMemoryRoomStore`, `RoomService`, `InMemorySessionBindingStore`,
  `InMemoryActiveRoomSessionResolver`, `SocketRoomStatePublisher`, and
  `CleanupService`.
- Redis mode uses the Redis-backed async store interfaces returned by
  `createAsyncStateBackend(...)`.

Introduce thin async adapters around the existing room-domain logic instead of
rewriting that logic:

- `AsyncRoomService` materializes the current active room set into a temporary
  in-memory store, runs the existing `RoomService` logic unchanged, and writes
  the resulting room state back through the async store.
- `AsyncActiveRoomSessionResolver`, `AsyncSocketRoomStatePublisher`, and
  `AsyncCleanupService` provide the minimum async runtime surface needed for
  Redis-backed requests and cleanup.
- `AsyncOperationQueue` serializes Redis-backed room mutations within a single
  process.

Phase 3 therefore supports Redis mode as:

- authoritative active room state in Redis;
- authoritative latest-tab-wins session ownership in Redis;
- a single app instance operational profile.

Phase 3 explicitly does **not** claim true multi-instance support. YASP will
not add a Socket.IO Redis adapter or distributed timer/cleanup ownership until
those later-phase decisions are made.

## Consequences

- Memory mode stays default and behavior-identical to the pre-Redis runtime.
- Redis mode can now actually serve traffic while preserving the existing room
  semantics and the ephemeral product model.
- Backend selection remains centralized; domain logic stays free of backend
  checks.
- Redis room/session keys still represent active state only and still expire
  via TTLs. No history or archive keys are introduced.
- Live Redis integration tests can now validate the real runtime path in CI.
- Cross-instance write coordination is still unresolved: `AsyncOperationQueue`
  only protects one process. Multiple app instances attached to the same Redis
  are still outside the supported deployment model.
- Timer ownership, stale-participant cleanup ownership, and Socket.IO fan-out
  remain future work.
