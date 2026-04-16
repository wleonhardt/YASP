# YASP — Yet Another Scrum Poker

YASP is a lightweight, real-time scrum poker app for teams that want fast estimation without accounts, stored history, or vendor lock-in.

- No accounts or authentication
- Ephemeral rooms by design
- Default deployment: single Docker container
- Optional AWS/CDK deployment path
- Optional Redis-backed active-state backend for shared ephemeral room/session state

**Hosted version:** [app.yasp.team](https://app.yasp.team/)

## Product philosophy

YASP is intentionally narrow:

- lightweight enough to self-host
- ephemeral enough to avoid becoming a planning system of record
- no-auth by design, with room links behaving like bearer-style meeting links
- no history, archive, or audit-log feature

Redis does not change that philosophy. It is only an optional backend for
TTL-bound active room and session state, not a history feature.

## Current feature set

- Create a room and join by code or link
- Vote as a participant or join as a spectator
- Reveal, reset, and advance rounds
- Moderator transfer, including disconnect handoff and reconnect continuity
- Shared round timer with presets, pause/reset, honk, optional sound, and auto-reveal
- Deck presets plus per-room custom decks
- Results summary with average, median, mode, spread, consensus, and distribution
- Moderator-only round report exports plus participant view-only round summary
  after reveal, both limited to the current round in the current session
- Room settings for reveal/reset/deck-change permissions and participant controls
- Dark/light theme support
- Localized UI in `en`, `es`, `fr`, `de`, `pt`, `ja`, `ko`, `zh-Hans`, and `zh-Hant`
- Accessibility-focused interaction patterns: keyboard support, live announcements, reduced-motion handling, and forced-colors fallbacks

## Runtime profiles

YASP currently supports two runtime profiles:

| Profile | Status | Stores | Does not provide |
| --- | --- | --- | --- |
| `memory` | shipped, default | active rooms in-process | history, archive, safe multi-instance support |
| `redis` | shipped, opt-in, operationally single-instance | active room state and socket-session ownership in Redis with TTL | history, archive, audit trail, safe cross-node fanout/timer/cleanup coordination |

Important constraints:

- `memory` mode is still the default and the simplest deployment shape.
- `redis` mode is **not** a claim of true horizontal scaling yet.
- Multiple app instances pointed at the same Redis are still out of scope until
  cross-node fanout, timer ownership, cleanup ownership, and write coordination
  are explicitly solved.

See [docs/horizontal-scaling.md](./docs/horizontal-scaling.md) and
[plans/decisions/](./plans/decisions/) for the exact current scaling status.

## Architecture

YASP uses a TypeScript monorepo with npm workspaces:

| Layer | Technology |
| --- | --- |
| Client | React 18 + Vite |
| Server | Fastify + Socket.IO |
| Shared contracts | TypeScript project references in `shared/` |
| Runtime | Node.js 20+ |
| Default deploy | single Docker container |
| Optional infra path | AWS CDK (`cdk/`) |

The server is authoritative. Clients send commands such as `cast_vote`,
`reveal_votes`, or timer actions; the server validates the action and publishes
the updated room state.

`sessionId` is a browser continuity token stored in `localStorage`. It supports
reconnect and latest-tab-wins continuity. It is not an account or identity
proof.

## Repository layout

```text
yasp/
├── client/   React + Vite SPA
├── server/   Fastify + Socket.IO runtime and tests
├── shared/   Shared types and event contracts
├── cdk/      Optional AWS deployment stack
├── docs/     Focused deep-dive docs
├── plans/    ADRs, queue, and open questions
└── tests/    Script- and Playwright-based checks
```

## Local development

Prerequisites:

- Node.js 20+
- npm 9+

```bash
git clone https://github.com/wleonhardt/YASP.git yasp
cd yasp
npm install
npm run dev
```

This starts:

- the Fastify + Socket.IO server on `http://localhost:3001`
- the Vite dev client on `http://localhost:5173`

### Common commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | run client + server in development |
| `npm test` | script tests + server Vitest + client Vitest |
| `npm run test:a11y` | Playwright accessibility smoke suite |
| `npm run i18n:check` | validate locale keys/placeholders |
| `npm run lint` | ESLint, zero warnings |
| `npm run build` | production build for shared, server, and client |
| `npm run format:check` | Prettier verification |

## Configuration

No `.env` file is required for the default local memory profile.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | HTTP + WebSocket listen port |
| `HOST` | `0.0.0.0` | bind address |
| `YASP_STATE_BACKEND` | `memory` | choose `memory` or `redis` |
| `REDIS_URL` | — | required only when `YASP_STATE_BACKEND=redis` |
| `NODE_ENV` | unset locally | set to `production` in Docker/prod |

Redis mode remains ephemeral-only. It stores active room/session state with
TTL, not history.

## Docker

The default self-hosted path is still a single container in `memory` mode:

```bash
docker run --rm -p 3001:3001 wleonhardt/yasp:main
```

Open [http://localhost:3001](http://localhost:3001).

Notes:

- In `memory` mode, restarting the container clears active rooms.
- The container exposes `GET /api/health`, and the image includes a Docker
  `HEALTHCHECK`.
- On Apple Silicon, use `--platform linux/amd64` if you need the x86_64 image
  target.

Build locally:

```bash
docker build -t yasp:local .
docker run --rm -p 3001:3001 yasp:local
```

If you intentionally opt into `redis` mode, you must supply Redis separately
and pass `YASP_STATE_BACKEND=redis` plus `REDIS_URL`. That profile is still
single-instance and is documented in
[docs/horizontal-scaling.md](./docs/horizontal-scaling.md).

## Deployment and operations

- **Plain Docker:** the simplest supported deployment profile.
- **AWS/CDK:** optional CloudFront + WAF + Basic Auth + single EC2 + nginx +
  Docker path. See [cdk/README.md](./cdk/README.md).

The current CDK stack deploys the default single-instance memory profile. It
does not yet wire first-class Redis configuration into the userdata/service
bootstrap. That is intentional: the AWS path stays memory-only by default
until Redis mode is honestly more than a single-instance runtime profile. Any
future Redis deploy support would be a separate advanced profile, not the
default path.

Day-to-day runtime monitoring, certificate awareness, container restart
handling, and reconnect-failure visibility live in
[docs/operations-runbook.md](./docs/operations-runbook.md). Branch protection,
required-checks list, and merge queue setup live in
[docs/branch-protection.md](./docs/branch-protection.md).

## Testing, CI, and quality gates

The repo has both blocking and advisory CI lanes.

The main blocking checks today are:

- `validate` — translations, lint, build, tests, format
- `a11y-smoke` — Playwright accessibility smoke coverage
- `docker-validation` — production image build + healthcheck + root document
- `cdk-synth` — when `cdk/` changes
- `CodeQL` — security query pack

Additional security and hygiene lanes remain advisory until their baselines are
clean or the relevant GitHub features are fully enabled:

- dependency review
- Trivy repo/image scans
- `npm audit`
- strict lint
- Knip
- OSSF Scorecard

The planned blocker-promotion order for the repo-managed advisory lanes is:
`npm audit` first, `lint:strict` second, `knip` third. OSSF Scorecard stays
advisory.

The source of truth for the current CI/security split is
[docs/security-scanning.md](./docs/security-scanning.md). The exact required-
checks list and merge-queue posture for `main` lives in
[docs/branch-protection.md](./docs/branch-protection.md).

Dependabot auto-merge is also intentionally conservative: only low-risk
single-dependency Dependabot PRs get GitHub auto-merge enabled, and required
checks still gate the actual merge. Runtime, deployment, Docker, CDK, grouped,
and major-version updates stay manual.

Each PR also gets two advisory-only signals from the `validate` job:

- **Client bundle size report** — per-asset raw + gzip totals are appended
  to the run summary so material bundle growth is visible at review time.
- **Client preview artifact** — the built `client/dist/` is uploaded for
  seven days so reviewers can grab the static SPA shell without spinning
  up the dev server. The realtime server is still required for full
  functional review.

## Accessibility

YASP has had substantial accessibility remediation work and now includes:

- keyboard-operable core flows
- semantic landmarks and route-aware titles
- live-region announcements for room-state changes
- reduced-motion handling
- forced-colors fallbacks

Current validation status:

- automated smoke coverage in CI via `npm run test:a11y`
- browser/manual QA completed for core flows
- real assistive-technology validation is still outstanding in a few areas

YASP should **not** be publicly described as WCAG-conformant yet.

See:

- [ACCESSIBILITY_WCAG_2_2_AAA_AUDIT.md](./ACCESSIBILITY_WCAG_2_2_AAA_AUDIT.md)
- [ACCESSIBILITY_MANUAL_QA_CHECKLIST.md](./ACCESSIBILITY_MANUAL_QA_CHECKLIST.md)
- [ACCESSIBILITY_MANUAL_VALIDATION_PLAN.md](./ACCESSIBILITY_MANUAL_VALIDATION_PLAN.md)

## Localization

Localization uses `i18next` + `react-i18next` with locale files committed in
the repo.

- English is the source and fallback locale.
- Supported locales: `en`, `es`, `fr`, `de`, `pt`, `ja`, `ko`, `zh-Hans`,
  `zh-Hant`
- `npm run i18n:check` is enforced in CI.
- Terminology guidance lives in [docs/i18n-glossary.md](./docs/i18n-glossary.md).

## Realtime recovery and support

YASP keeps the healthy connection path quiet. Recovery UI only appears when the
live room connection is not healthy.

- `Retry` starts another normal reconnect attempt using the default realtime
  path.
- `Try compatibility mode` is a current-tab fallback that reconnects with the
  more conservative polling transport. It is not a permanent mode or a global
  preference.
- Users should try compatibility mode when the page loads but live updates stay
  disconnected.
- Likely causes are described cautiously: browser extensions, proxies, VPNs, or
  network policy can interfere with realtime transports.
- `Connection details` exposes a small, non-sensitive diagnostics set for
  support and troubleshooting: connection status, transport, retry count,
  health probe result, last connected/error timestamps, and the realtime
  endpoint. The panel intentionally avoids sensitive user or environment data.

Practical manual checks for recovery/support:

- landing page: failed and offline states show clear actions without cluttering
  the connected path
- room page: reconnecting and failed states keep `Retry`, compatibility mode,
  and diagnostics readable on narrow screens
- compatibility mode: helper copy stays cautious and does not promise a fix
- diagnostics: disclosure works with keyboard navigation and wraps cleanly on
  mobile

## Round report and summary behavior

Round detail access stays intentionally small and ephemeral:

- moderators get `View round report` after reveal
- participants get `View round summary` after reveal
- participant mode is view-only and never shows export actions
- moderator exports remain `Export CSV`, `Export JSON`, and `Print`
- round detail is current-round-only and session-only
- resetting or advancing the round removes the current round detail entry point
- moderators must export before reset/next round if they need to keep a copy

Practical manual checks for round detail behavior:

- no report/summary trigger appears before reveal
- the correct moderator/participant label appears after reveal
- participants never see export actions
- reset/next round removes access to the prior revealed round detail

## Security posture

YASP is intentionally no-auth:

- room URLs are bearer-style meeting links
- `sessionId` is continuity, not identity proof
- moderators are a room-level role, not an authenticated account

Within that product boundary, recent hardening includes:

- CSP and browser security headers
- input validation and abuse shaping
- non-root container image plus hardened EC2 runtime flags
- healthcheck-based deploy rollback
- layered CI/security scanning

YASP still does **not** claim:

- strong user authentication
- durable privacy guarantees beyond bearer-link secrecy
- history or audit-trail persistence
- true multi-instance readiness

Source-of-truth docs:

- [SECURITY_THREAT_MODEL.md](./SECURITY_THREAT_MODEL.md)
- [SECURITY_AUDIT_REPORT.md](./SECURITY_AUDIT_REPORT.md)
- [SECURITY_REMEDIATION_PLAN.md](./SECURITY_REMEDIATION_PLAN.md)
- [docs/security-scanning.md](./docs/security-scanning.md)

## Contributor workflow

Before making or proposing structural changes:

1. Read [plans/next-up.md](./plans/next-up.md).
2. Read [plans/open-questions.md](./plans/open-questions.md).
3. Check accepted ADRs under [plans/decisions/](./plans/decisions/).

Before considering work complete:

1. Run `npm test`.
2. Run `npm run lint`.
3. Run `npm run build`.
4. Update docs/plans if product or operational behavior changed.

AI-agent-specific repo rules live in [AGENTS.md](./AGENTS.md).

## License

MIT — see [LICENSE](./LICENSE).
