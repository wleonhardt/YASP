# Next Up

## Queue

- **UI upgrade — Phase 10 subtraction pass.** Phases 1–9 added a panel
  per phase and never removed anything; the cumulative effect is a
  visually dense room where nothing dominates. Phase 10 is a ruthless
  subtraction pass: lazy-mount the story-agenda and timer-strip,
  trim the round-action-bar, swap the drawer trigger icon (currently
  visually collides with the theme toggle), de-duplicate the drawer
  heading and stale "Sound on" copy, hide zero-count distribution
  columns, shrink InviteHero after the local user votes, and audit
  eyebrows. Eight focused commits; each independently revertable.
  Full spec under "Phase 10 — Subtraction pass" in
  [`ui-upgrade.md`](ui-upgrade.md). Recommended next slice:
  P10.9+P10.10 ("Chart cleanup").
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

- 2026-05-05: Started the UI upgrade with the independent Phase 8 foundation
  pass. The app now has skip links on landing/room states, restored visible
  focus for the language switcher, native dark/light form chrome hints,
  deck-token translate guards, timer and consensus live-region hints, numeric
  mobile input attributes for timer duration controls, vote-card shortcut
  descriptions, mobile touch hygiene, and modal scroll containment. No backend,
  shared-package, persistence, or dependency changes were introduced.
- 2026-05-05: Landed the low-risk Phase 1 UI cleanup subset. The topbar now
  carries only room identity and utilities, Participants/Revealed votes no
  longer duplicate their headings with eyebrows, the timer Start action has
  primary weight while Reset/Beep stay quiet, and the duration minutes/seconds
  fields are visually grouped as one control. Sound relocation remains queued
  as the last Phase 1 slice because it changes timer sound state ownership.
- 2026-05-05: Completed Phase 1 by moving the interactive timer sound toggle
  into the room utility menu. Timer surfaces now subscribe to the shared
  persisted sound preference and render only a read-only sound-state indicator,
  while the utility toggle keeps audio priming behavior intact.
- 2026-05-05: Completed Phase 2 by adding `RoundActionBar` above the
  deck/results stage and removing Reveal/Next/Reset actions from
  `ModeratorControls` in both desktop and compact modes. The current phase now
  has a single primary CTA in the stage zone; moderator controls are timer,
  settings, and transfer only.
- 2026-05-05: Completed Phase 3 by swapping the room layout so
  `RoundActionBar` plus deck/results own the dominant stage column and
  Participants move into a compact awareness rail. The rail keeps participant
  names visible, removes the large waiting placeholders during voting, and
  makes the one connected voter who has not voted the visually prominent
  state.
- 2026-05-05: Completed Phase 4 by hiding remaining moderator-only controls
  behind a topbar drawer and adding a shared `TimerStrip` above the stage.
  Moderators can still reach timer pacing, settings, and transfer controls
  from the drawer, while non-moderators land directly on the stage plus
  participant rail.
- 2026-05-05: Completed Phase 5 by replacing the revealed-round distribution
  rows with a deck-ordered vertical column chart and compact stat strip. The
  chart preserves non-deck vote tokens, keeps non-numeric tokens at the right,
  and adds a separator when numeric and non-numeric card buckets appear
  together.
- 2026-05-05: Completed Phase 6 by replacing the participant rail with an
  invite hero whenever the room has no connected non-moderator voters. The
  hero makes the room code and copy-link action prominent, keeps
  moderator-plus-spectator rooms in the invite state, and intentionally skips
  QR generation to avoid a new dependency.
- 2026-05-05: Completed Phase 7 by making non-stage panels recede to the
  shared surface token, promoting only the stage deck/results panel with the
  stronger border/background treatment, and confirming the remaining
  operational section labels are not redundant panel headers.
- 2026-05-05: Started optional Phase 9 with P9.1 Waiting-on-Bob. The
  participant rail now switches from the numeric voted summary to "Waiting on
  {name}" only when exactly one connected voter has not voted, and that
  voter's presence dot gets a slightly stronger calm highlight.
- 2026-05-05: Continued optional Phase 9 with P9.2 Outlier callout. Revealed
  rounds now show a tone-safe "One estimate differs — worth a quick check?"
  disclosure above the distribution chart only when one or two voter estimates
  sit more than two deck cards from the mode. Names stay out of the headline
  and appear only after expanding the disclosure.
- 2026-05-05: Continued optional Phase 9 with P9.4 Almost-consensus prompt.
  Revealed rounds now reuse the round spotlight disclosure for cases where at
  least three voters participated and exactly one voter differs from the
  shared estimate. The headline stays name-free and the differing voter only
  appears after expansion.
- 2026-05-05: Continued optional Phase 9 with P9.6 Consensus celebration.
  The revealed-results consensus chip now gets a small decorative spark
  flourish when everyone agrees. The flourish is hidden from assistive tech
  and disables animation under reduced-motion preferences.
- 2026-05-05: Implemented Phase 9 P9.3 Re-open voting as a real
  shared/server/client state transition. Re-open follows the existing reset
  policy, returns the same round to hidden-vote voting, preserves each
  participant's previous card as their own editable selection, and removes the
  prior reveal snapshot so re-reveal writes the corrected result.
- 2026-05-05: Implemented Phase 9 P9.5 Story labels/agenda as ephemeral
  active room state. Rooms now carry a current story label plus an optional
  agenda queue; moderators can add, bulk-paste, reorder, remove, and start
  the next queued story as a new round. Participants see the current story
  and queued agenda read-only, and round/session reports include story labels.
- 2026-05-05: Started Phase 10 with P10.1/P10.2/P10.3, reclaiming deck
  space without new product scope. Empty rooms now hide the story agenda until
  a story exists or the moderator opts into "Track stories"; the timer strip
  stays hidden until the timer is used or configured away from the default;
  and the topbar room code becomes a code-only chip while InviteHero owns
  sharing.
- 2026-05-05: Continued Phase 10 with P10.4/P10.5, trimming the stage action
  bar to one primary action plus a small re-open-voting text action after
  reveal. Reset round moved into moderator room settings as an admin action,
  and the redundant visible `NEXT STEP` / `Voting` / `Revealed` copy was
  removed from the action bar.
- 2026-05-05: Continued Phase 10 with P10.6/P10.7/P10.8 drawer fixes. The
  moderator drawer trigger now uses a sliders icon instead of the light-mode
  style burst, embedded drawer controls suppress their duplicate
  "Moderator controls" heading, and the collapsed timer summary no longer
  repeats the timer sound preference.
- 2026-04-16: Fixed the AWS deploy failure mode that was presenting as a
  health-check timeout but was actually Docker disk exhaustion on the EC2
  origin (`failed to register layer ... no space left on device`). The deploy
  workflow now logs host/Docker disk usage and prunes unused containers,
  images, build cache, and volumes before pulling a new immutable image tag
  and again before rollback. The EC2 bootstrap run script mirrors the same
  cleanup guard for future hosts, and the ops runbook now documents the
  symptom and manual recovery commands.
- 2026-04-16: Added the next layer of low-noise maintenance signals without
  growing the scanner stack. The validate CI job now appends a per-asset
  client bundle-size report to the run summary and uploads a seven-day
  `client/dist/` preview artifact on PRs. New focused docs consolidate the
  exact `main` ruleset / required-checks / merge-queue posture
  (`docs/branch-protection.md`) and the deployed-instance ops runbook
  covering uptime, certificate awareness, container restarts, and synthetic
  reconnect probes (`docs/operations-runbook.md`). Bundle thresholds stay
  advisory, no new scanner was added, and Dependabot/scanner posture is
  unchanged.
- 2026-04-16: Closed the remaining refresh-time recovery flash in the
  realtime bootstrap flow. Persisted compatibility mode now stays quiet on
  page refresh while the initial socket/bootstrap failure signals settle, and
  the recovery notice only appears after the initial attempt is terminally
  failed or survives the health-probe grace window. Happy-path refreshes stay
  neutral/connecting, compatibility mode remains session-scoped, and no
  backend changes were required.
- 2026-04-16: Smoothed the realtime recovery UX so the full recovery notice
  no longer flashes during initial bootstrap before a real failure signal, and
  compatibility mode now persists for the current browser session via
  `sessionStorage`. Recovery diagnostics/retry behavior remain intact, no
  backend changes were required, and a recovery-only "Use default mode"
  action now clears the session-scoped compatibility preference when users are
  actively troubleshooting.
- 2026-04-16: Post-remediation verification confirmed the code-fixable GitHub
  code scanning backlog is closed on commit `73babea`. The remaining open
  alerts are governance/settings/process items (`BranchProtectionID`,
  `CodeReviewID`, `FuzzingID`, `CIIBestPracticesID`) plus two dismissal
  candidates (`MaintainedID` age heuristic and the `js/biased-cryptographic-random`
  false positive). Maintainer follow-up and exact dismissal text now live in
  `docs/security-scanning.md`; runtime behavior stayed unchanged.
- 2026-04-16: Hardened the repository against the current GitHub code
  scanning backlog by pinning GitHub Action usages to immutable commits,
  narrowing the Dependabot auto-merge workflow token scope, replacing the
  privileged `workflow_run` checkout in the Docker publish workflow with an
  immutable Git context, pinning the Docker base image to a digest, removing
  the unused bundled npm toolchain from the runtime image to eliminate
  container-only CVEs, and adding a first-class `SECURITY.md` reporting
  policy. The app runtime behavior stayed unchanged.
- 2026-04-16: Polished the realtime recovery notice and revealed-round footer
  with calmer support copy, a current-tab-only compatibility-mode helper, and
  quiet current-round helper text for report/summary access. The diagnostics
  disclosure stayed non-sensitive, the happy path stayed visually quiet, and
  the report/summary flow remained current-round-only/session-only with
  moderator-only exports.
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
