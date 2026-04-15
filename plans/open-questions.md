# Open Questions

## Open

- No active open questions right now. The current scaling and deployment
  posture is recorded in ADR 0004, and the remaining multi-instance Redis work
  is intentionally deferred until operator requirements justify Phase 4.

## Resolved

- 2026-04-15: The revealed-round footer entry points now keep role separation
  without crowding the Results panel on narrow layouts. Moderators retain the
  report entry point and gain a clipboard-only "Copy summary" helper, while
  participants still get only the view-only "Round summary". The feature
  remains client-only, current-round-only, session-only, and explicitly avoids
  new exports, persistence, or history/archive browsing.
- 2026-04-15: Revealed-round detail access is now split by role without adding
  new permissions complexity. Moderators keep the report/export tooling, while
  non-moderators can open a view-only "Round summary" for the current revealed
  round only. The implementation remains client-only, session-only, and
  ephemeral with no history/archive behavior.
- 2026-04-15: Dependabot auto-merge remains intentionally conservative. YASP
  only enables GitHub auto-merge for low-risk single-dependency Dependabot PRs
  after normal required checks pass. Major updates, runtime/deployment
  packages, Docker changes, `cdk/`, deployment workflows, and grouped
  dependency updates remain manual review.
- 2026-04-15: The AWS/CDK deployment path remains intentionally memory-only.
  The stack does not gain first-class Redis wiring yet because Redis mode is
  still only a single-instance Redis-backed runtime profile. If Redis deploy
  support is added later, it will be a separate advanced deployment profile,
  not the default path (ADR 0004).
- 2026-04-15: True multi-instance Redis support remains a valid long-term
  infrastructure goal, but it is not a near-term core product priority. The
  remaining design questions around cross-instance write coordination and
  timer/cleanup ownership are deferred until operator requirements justify
  Phase 4 work (ADR 0004).
- 2026-04-15: Advisory CI/security lanes remain intentionally advisory until
  they stay low-noise long enough to promote. The current promotion order is
  `npm audit` first, `lint:strict` second, `knip` third, while OSSF Scorecard
  stays advisory by design.
- 2026-04-15: Redis key TTL grace now tracks the cleanup cadence instead of a
  fixed 60s buffer. `RedisRoomStore` sets room-key TTL to
  `room.expiresAt - now + CLEANUP_INTERVAL_MS + 5s`, which keeps the active
  room available long enough for cleanup to observe and remove it coherently.
