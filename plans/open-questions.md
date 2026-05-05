# Open Questions

## Open

- **UI: discussion-phase enhancements.** The reveal-and-discuss phase is
  where YASP could differentiate. Out of scope for the current
  [`ui-upgrade.md`](ui-upgrade.md) plan but worth deciding before/after
  Phase 9 lands:
  - Outlier highlighting ("Alice picked 13, others 5. Discuss?")
  - Re-open voting affordance distinct from "Reset round"
  - Almost-consensus prompt naming the outlier
  - Story labels per round + end-of-session story queue (would let YASP
    be the *only* tool for an estimation meeting, not just one tab)
  - Consensus celebration flourish (motion-aware)
- **UI: viewport mix.** We currently assume desktop ~50% / mobile ~30% /
  tablet ~20% based on intuition, not data. Worth verifying via analytics
  if/when added — Phase 4 (drawer) and tablet-breakpoint priorities should
  follow real numbers, not guesses.
- 2026-05-05 review: Phase 8 foundation work did not create new open
  questions. The existing discussion-phase and viewport-mix questions remain
  the active UI uncertainties.
- 2026-05-05 review: Phase 1 visual cleanup did not create new open questions.
  Sound relocation is still implementation work, not a product decision.
- 2026-05-05 review: Phase 1 sound relocation did not create new open
  questions. Phase 2 can proceed without an ADR because the change remains
  client-only and does not alter the product's ephemeral state model.
- 2026-05-05 review: Phase 2 `RoundActionBar` did not create new open
  questions. Phase 3 can proceed as planned; the 768px breakpoint remains the
  main verification risk already tracked by the viewport-mix question.
- 2026-05-05 review: Phase 3 stage layout did not create new product or
  architecture questions. Phase 4 can proceed without an ADR because it is
  still a client-only chrome relocation; the existing viewport-mix question
  remains the main tablet validation thread.
- No other active open questions right now. The current scaling and deployment
  posture is recorded in ADR 0004, and the remaining multi-instance Redis work
  is intentionally deferred until operator requirements justify Phase 4.

## Resolved

- 2026-04-16: The red AWS deploys were not caused by an application
  regression. `journalctl -u yasp` showed Docker failing to register a newly
  pulled image layer with `no space left on device`, so the correct fix was
  deploy-time Docker-state reclamation and clearer disk-pressure diagnostics,
  not backend or health-check changes.
- 2026-04-16: Maintenance/CI roadmap for the next slice is settled. Next
  additions stay low-noise rather than adding more scanners: a PR-time
  advisory client bundle-size report and a seven-day `client/dist/` preview
  artifact in the existing `validate` job, plus two focused docs
  (`docs/branch-protection.md`, `docs/operations-runbook.md`) covering the
  required-checks list, merge-queue posture, uptime/cert/restart/reconnect
  visibility for the deployed instance. Coverage gating, full PR preview
  infra, Lighthouse/perf SaaS, CODEOWNERS, and additional scanners are
  explicitly deferred as overkill at YASP's current size.
- 2026-04-16: Persisted compatibility mode no longer causes the recovery
  notice to flash on page refresh. The client now treats early
  `connect_error`/retry noise during initial bootstrap as pending failure
  state, waits for the initial attempt to either recover or survive a short
  post-probe grace window, and only then surfaces the warning/recovery block.
  Offline, reconnect-failed, and confirmed failed states still show the full
  recovery UI immediately.
- 2026-04-16: Realtime recovery bootstrap stays intentionally quiet until
  YASP has an actual recovery problem to show. The client hook now exports an
  explicit recovery-notice flag so landing and room routes keep first-load
  connecting states calm, only surfacing the full retry/compatibility
  diagnostics notice after offline/reconnecting/failed conditions or a
  confirmed initial failure. Compatibility mode now persists only for the
  current browser session through `sessionStorage`, not across future browser
  sessions.
- 2026-04-16: Post-remediation verification left no unresolved runtime-code
  security findings. The remaining GitHub code scanning alerts are either
  governance/settings follow-up (`BranchProtectionID`, `CodeReviewID`,
  `FuzzingID`, `CIIBestPracticesID`) or dismissal candidates (`MaintainedID`
  as a repository-age heuristic and `js/biased-cryptographic-random` as a
  false positive). The maintainer checklist and exact dismissal text are
  recorded in `docs/security-scanning.md`.
- 2026-04-16: The open CodeQL `js/biased-cryptographic-random` finding for
  room IDs is a false positive, not a code bug. YASP's room ID alphabet is 32
  characters wide (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`), and `randomBytes()`
  yields uniform byte values across 256 possibilities. Because 256 is an exact
  multiple of 32, `byte % 32` remains uniform here and does not introduce
  modulo bias; the correct action is dismissing the alert with that rationale
  rather than changing the ID generator.
- 2026-04-16: Connection recovery help text and revealed-round affordances now
  stay intentionally modest. Compatibility mode is explained only as a
  current-tab fallback for "page loads but live updates stay disconnected",
  likely blockers are named cautiously (extensions, proxies, network policy),
  diagnostics remain sanitized/non-sensitive, and the revealed-round helper
  text clarifies current-round-only access without implying history or saved
  reports.
- 2026-04-15: Realtime recovery for "page loads but room never connects"
  cases now stays intentionally lightweight. YASP keeps the normal
  websocket-capable Socket.IO path on the happy path, exposes compatibility
  mode only as a user-invoked current-tab fallback, and reuses the existing
  `/api/health` probe to distinguish backend reachability from blocked
  realtime transport without adding persistence, auth, analytics, or a second
  connection subsystem.
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
