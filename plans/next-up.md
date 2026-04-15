# Next Up

## Queue

- Decide how future Redis mode will coordinate concurrent room writes across instances without introducing durable persistence semantics.
- Decide how future Redis mode will assign ownership for timer completion and room/stale-participant cleanup in multi-instance deployments.

## Done

- 2026-04-14: Phase 1 optional horizontal-scaling prep introduced explicit room/session/timer/publisher seams while keeping local in-memory behavior unchanged and documenting Redis as ephemeral shared state only.
