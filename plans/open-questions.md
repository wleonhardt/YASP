# Open Questions

## Open

- **UI: discussion-phase enhancements.** The reveal-and-discuss phase is
  where YASP could differentiate. Phase 9's selected enhancements have now
  landed, so this is a future-product thread rather than active
  implementation work.
- **UI: viewport mix.** We currently assume desktop ~50% / mobile ~30% /
  tablet ~20% based on intuition, not data. Worth verifying via analytics
  if/when added — Phase 4 (drawer) and tablet-breakpoint priorities should
  follow real numbers, not guesses.
- **UI: post-implementation QA findings (Q1–Q20).** A 2026-05-05 QA pass on
  the post-Phase-5 build surfaced 26 findings. The high/medium chrome issues
  called out there have been folded into Phase 10 through P10.8; the remaining
  active thread is the structural drawer-discoverability impression. Full list
  in [`ui-upgrade.md`](ui-upgrade.md) under "Post-implementation QA review."
  Continue folding low-severity visual cleanup into Phase 10 subtraction
  slices.
- **UI: moderator drawer discoverability.** Beyond the icon swap (Q1),
  do new moderators find the controls trigger on their own? A brief one-time
  highlight on first room creation OR a real moderator user-test would
  inform whether the drawer pattern survives long-term.
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
- 2026-05-05 review: Phase 4 moderator drawer did not create new product or
  architecture questions. Phase 5 remains client-only presentation work; the
  existing discussion-phase enhancements question is still the next product
  thread after results presentation.
- 2026-05-05 review: Phase 5 results presentation did not create new product
  or architecture questions. Phase 6 should use the existing empty-room trigger
  definition in `ui-upgrade.md`; the viewport-mix question remains the main
  manual verification risk for the next UI slice.
- 2026-05-05 review: Phase 6 empty-state invite hero did not create new
  product or architecture questions. QR generation remains intentionally
  omitted under the existing no-new-dependency constraint rather than being a
  new open decision.
- 2026-05-05 review: Phase 7 visual hierarchy polish did not create new
  product or architecture questions. The existing discussion-phase enhancement
  question remains the relevant thread before selecting specific Phase 9
  spotlight work.
- 2026-05-05 review: Phase 9 P9.1 Waiting-on-Bob did not create new product
  or architecture questions. P9.2/P9.4 still sit under the existing
  discussion-phase enhancement thread because they introduce post-reveal
  prompting behavior.
- 2026-05-05 review: Phase 9 P9.2 Outlier callout resolved the first
  discussion-phase prompt slice by using tone-safe, no-name headline copy and
  native click-to-expand details. P9.4 can reuse this pattern, while P9.3
  re-open voting and P9.5 story labels remain product/state decisions rather
  than presentation-only work.
- 2026-05-05 review: Phase 9 P9.4 Almost-consensus prompt reused the P9.2
  disclosure pattern and did not create new product or architecture questions.
  P9.3 re-open voting and P9.5 story labels remain deferred because they
  change round state semantics; P9.6 consensus celebration remains a
  presentation-only candidate if kept motion-aware.
- 2026-05-05 review: Phase 9 P9.6 Consensus celebration did not create new
  product or architecture questions. P9.3 re-open voting and P9.5 story
  labels remain the only Phase 9 items needing product/state decisions before
  implementation.
- 2026-05-05 review: Product direction recorded for the remaining Phase 9
  items. P9.3 should reuse the existing reset-permission model and preserve
  votes as hidden editable drafts rather than clearing or keeping revealed
  votes visible. P9.5 should become an optional ephemeral agenda, not a
  durable backlog. Implementation still needs shared/server/client design,
  but no new durable-state ADR is needed if it stays within TTL-bound active
  room/session state.
- 2026-05-05 review: Phase 9 P9.3 Re-open voting is now implemented, so the
  re-open-voting implementation question is resolved. P9.5 was the remaining
  Phase 9 product/state thread before the agenda implementation.
- 2026-05-05 review: Phase 9 P9.5 Story labels/agenda is now implemented as
  ephemeral active room state only. The current story label and optional queue
  are covered by the existing room TTL model; no durable backlog, account,
  integration, or history scope was added.
- 2026-05-05 review: Phase 10 P10.1 resolved the story-agenda default
  visibility question by hiding the empty agenda and exposing a local
  moderator-only "Track stories" opt-in from the drawer. P10.2/P10.3 did not
  create new product or architecture questions because they only subtract
  client chrome around existing state.
- 2026-05-05 review: Phase 10 P10.4/P10.5 did not create new product or
  architecture questions. Reset round remains an ephemeral active-room action;
  it only moved from the stage to moderator settings, while next/re-open
  continue to follow the existing reset-policy permission model.
- 2026-05-05 review: Phase 10 P10.6/P10.7/P10.8 did not create new product or
  architecture questions. The drawer trigger icon, duplicate heading removal,
  and timer summary copy change are client-only chrome cleanup; drawer
  discoverability remains the only related open UX validation thread.
- 2026-05-05 review: Phase 10 P10.9/P10.10 did not create new product or
  architecture questions. The distribution chart still preserves deck-order
  context and mixed-token separation; zero-count buckets are only visually
  demoted.
- 2026-05-05 review: Phase 10 P10.11 did not create new product or
  architecture questions. InviteHero compact mode is client-only presentation
  driven by the existing local vote state and does not change room state or
  invite semantics.
- 2026-05-05 review: Phase 10 P10.12 did not create new product or
  architecture questions. Drawer animation and close-icon cleanup are
  client-only chrome changes and remain covered by the existing reduced-motion
  guardrail.
- 2026-05-05 review: Phase 10 P10.13/P10.14 did not create new product or
  architecture questions. Moderator controls still use the existing
  moderator-only visibility model; only the topbar placement and redundant
  room-code eyebrow changed.
- 2026-05-05 review: Phase 10 P10.15/P10.16/P10.17 did not create new product
  or architecture questions. The story agenda action visibility, visible room
  heading, and vote-deck eyebrow removal are client-only presentation cleanup.
- 2026-05-05 review: Manual Phase 10 smoke testing did not create new product
  or architecture questions. The discovered stacked-overlay issue was a
  client-only polish bug and is fixed by closing preferences before opening
  the moderator drawer.
- No new backend/state open questions are active right now. The current scaling
  and deployment posture is recorded in ADR 0004, and the remaining
  multi-instance Redis work is intentionally deferred until operator
  requirements justify Phase 4.

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
