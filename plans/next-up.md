# Next Up

## Queue

- Decide how future multi-instance Redis mode will coordinate concurrent room
  writes across instances without introducing durable persistence semantics.
- Decide how future multi-instance Redis mode will assign ownership for timer
  completion and room / stale-participant cleanup.
- Add Socket.IO Redis adapter work only after the write-coordination and
  cleanup-ownership model is accepted.

## Done

- 2026-04-15: Stabilized `ModeratorControls` client coverage by mocking the
  timer-sound storage read directly instead of relying on suite-global
  `localStorage`, which was racing under Vitest's parallel client workers.
- 2026-04-14: Phase 1 optional horizontal-scaling prep introduced explicit room/session/timer/publisher seams while keeping local in-memory behavior unchanged and documenting Redis as ephemeral shared state only.
- 2026-04-14: Phase 2 optional horizontal-scaling added Redis-backed `RoomStore` and `SessionBindingStore` prototypes behind `YASP_STATE_BACKEND=redis`, async store interfaces, composition-root backend selection with PING-based health check, and a shared contract suite running both in-memory and Redis (via `ioredis-mock`) implementations. Memory mode remains the default; RoomService async-wiring is deferred to Phase 3 (see ADR 0002).
- 2026-04-15: Phase 3 rewired the real server runtime so memory mode keeps the
  original synchronous path while `YASP_STATE_BACKEND=redis` uses Redis-backed
  async room/session state for authoritative active rooms and latest-tab-wins
  session ownership. Redis remains opt-in, ephemeral-only, and operationally
  single-instance (see ADR 0003).
- 2026-04-15: Phase 3 added live Redis coverage to the contract suites and a
  Redis-backed runtime integration suite, with CI now provisioning a Redis
  service container and `REDIS_TEST_URL` for real Redis validation.
