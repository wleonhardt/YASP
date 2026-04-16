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

- 2026-04-16: Tightened the round report consensus stat so it no longer tries
  to render long status prose as the primary metric value. The modal now uses
  a compact consensus indicator with supporting copy and vote count in the
  tile meta, keeping the stat grid readable at narrow card widths without
  changing report behavior or data.
- 2026-04-16: Localized the realtime recovery and diagnostics `connection`
  namespace for the non-English locale bundles (`de`, `es`, `fr`, `pt`, `ja`,
  `ko`, `zh-Hans`, `zh-Hant`) so the new disconnected/retry/compatibility and
  diagnostics UI ships with real translations instead of English placeholders.
  Also trimmed the diagnostics panel to omit `Browser origin` when it matches
  the realtime endpoint, keeping the UI unchanged otherwise.
- 2026-04-15: Added a calmer realtime recovery path for users who can load
  the app but fail to establish Socket.IO. Disconnected states now distinguish
  connecting/reconnecting/offline/failed, expose an on-demand compatibility
  mode that reconnects with polling-only transport for the current tab
  session, and show a lightweight diagnostics panel with sanitized transport,
  retry, health-probe, and origin details without adding persistence,
  accounts, or background analytics.
- 2026-04-15: Polished the revealed-round Results footer so the moderator
  report entry point and participant summary entry point stay calm, balanced,
  and mobile-safe across narrow widths. Moderators also now get a
  session-only/current-round-only "Copy summary" action that copies a concise
  plain-text snapshot to the clipboard without adding exports, persistence,
  backend changes, or history/archive behavior.
- 2026-04-15: Extended the revealed-round detail modal so non-moderators can
  open a view-only "Round summary" after reveal using the same current-round
  client snapshot as the moderator report. Export actions remain
  moderator-only, no backend/persistence/history was added, and the modal
  still disappears on reset with no past-round recovery.
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
