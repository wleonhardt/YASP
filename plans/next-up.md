# Next Up

## Queue

- No near-term Redis/CDK work is queued. Revisit Phase 4 only if operator
  needs justify it:
  - rolling deploys without losing active rooms
  - meaningful concurrent traffic beyond one app instance
  - hosting targets that require multiple app instances
  - higher availability requirements than the current single-instance posture
- If Phase 4 is reprioritized later, start with cross-instance write
  coordination and timer/cleanup ownership before any Socket.IO Redis adapter
  or Redis-backed deployment profile work.

## Done

- 2026-04-15: Added a conservative Dependabot auto-merge workflow that only
  enables GitHub auto-merge for single-dependency low-risk bot PRs
  (GitHub Actions patch/minor, npm devDependency patch/minor, and qualifying
  non-major security updates). Major bumps, runtime/deployment-sensitive
  packages, Docker changes, `cdk/`, deployment workflows, and grouped updates
  stay manual.
- 2026-04-15: Accepted ADR 0004 to keep the supported/default AWS/CDK
  deployment path intentionally memory-only, defer first-class Redis infra
  wiring until Redis mode is honestly more than a single-instance runtime
  profile, and treat true multi-instance Redis support as later infrastructure
  work instead of a near-term product priority.
- 2026-04-15: Recorded the CI/security advisory-lane promotion policy:
  `npm audit` is the first blocker candidate, `lint:strict` is second, `knip`
  is third, and OSSF Scorecard stays advisory.
- 2026-04-15: Refreshed the repository documentation so README, AGENTS,
  security, accessibility, scaling, deployment, and localization guidance all
  describe the current Fastify + Socket.IO product, the default memory runtime,
  and the optional single-instance Redis-backed active-state profile
  consistently.
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
