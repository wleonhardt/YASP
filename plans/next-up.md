# Next Up

## Queue

- Phase 3: re-plumb `RoomService` onto the async `AsyncRoomStore` /
  `AsyncSessionBindingStore` interfaces so `YASP_STATE_BACKEND=redis` can
  actually serve traffic. Remove the startup refusal in `index.ts` as part of
  this work.
- Phase 3: add live-Redis coverage to CI per `docs/redis-integration-testing.md`
  (sidecar Redis service, `REDIS_TEST_URL`-gated third `runContract` call).
- Decide how future Redis mode will coordinate concurrent room writes across instances without introducing durable persistence semantics.
- Decide how future Redis mode will assign ownership for timer completion and room/stale-participant cleanup in multi-instance deployments.

## Done

- 2026-04-14: Phase 1 optional horizontal-scaling prep introduced explicit room/session/timer/publisher seams while keeping local in-memory behavior unchanged and documenting Redis as ephemeral shared state only.
- 2026-04-14: Phase 2 optional horizontal-scaling added Redis-backed `RoomStore` and `SessionBindingStore` prototypes behind `YASP_STATE_BACKEND=redis`, async store interfaces, composition-root backend selection with PING-based health check, and a shared contract suite running both in-memory and Redis (via `ioredis-mock`) implementations. Memory mode remains the default; RoomService async-wiring is deferred to Phase 3 (see ADR 0002).
