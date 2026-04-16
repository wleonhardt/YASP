<div align="center">
<pre>
██╗   ██╗ █████╗ ███████╗██████╗ 
╚██╗ ██╔╝██╔══██╗██╔════╝██╔══██╗
 ╚████╔╝ ███████║███████╗██████╔╝
  ╚██╔╝  ██╔══██║╚════██║██╔═══╝ 
   ██║   ██║  ██║███████║██║     
   ╚═╝   ╚═╝  ╚═╝╚══════╝╚═╝     
</pre>

### 🃏 Yet Another Scrum Poker

[![CI](https://img.shields.io/github/actions/workflow/status/wleonhardt/yasp/validate.yml?branch=main&style=flat-square&label=CI&color=6C63FF)](https://github.com/wleonhardt/yasp/actions)
[![Docker Pulls](https://img.shields.io/docker/pulls/wleonhardt/yasp?style=flat-square&color=6C63FF&logo=docker&logoColor=white)](https://hub.docker.com/r/wleonhardt/yasp)
[![Image Size](https://img.shields.io/docker/image-size/wleonhardt/yasp/main?style=flat-square&color=6C63FF)](https://hub.docker.com/r/wleonhardt/yasp/tags)
[![Node 20](https://img.shields.io/badge/node-20+-6C63FF?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![License MIT](https://img.shields.io/badge/license-MIT-6C63FF?style=flat-square)](./LICENSE)

**Lightweight · Realtime · Self-hosted · Ephemeral by design**

🌐 **[app.yasp.team](https://app.yasp.team)** · 🐳 **[wleonhardt/yasp](https://hub.docker.com/r/wleonhardt/yasp)**

</div>

---

> *Planning poker should feel like a team ritual, not infrastructure management.*

YASP is a fast, no-fuss collaborative estimation tool. No accounts. No stored history. No reason to still be talking about it after the sprint planning ends.

| | Feature |
|---|---|
| ⚡ | Realtime voting via WebSockets |
| 🃏 | Multiple deck presets + custom decks |
| 👀 | Spectator mode |
| 🔄 | Reconnect-friendly — rejoin mid-session |
| ⏱️ | Shared round timer with presets, pause, auto-reveal |
| 🎯 | Reveal / reset / next round flows |
| 📊 | Results with avg, median, mode, spread, consensus |
| 🔁 | Moderator transfer + disconnect handoff |
| 🌍 | Localized in 9 languages |
| 🦾 | Keyboard-navigable, live-region announcements |
| 🧼 | No database · No Redis · No external services |

---

## 🚀 Quick Start

```bash
docker run --rm -p 3001:3001 wleonhardt/yasp:main
```

Open → `http://localhost:3001`

Three things that are true once this command runs:

- a full scrum poker app is live
- nothing was installed on your machine
- nothing will remain when you stop it

---

## ☁️ Ephemeral by Design

```
  ┌─────────────────────────────────────────────┐
  │  No accounts       No stored history        │
  │  No database       No persistence layer     │
  │  No migrations     No infrastructure sprawl │
  │  No stale rooms    No baggage               │
  └─────────────────────────────────────────────┘
```

All state lives in memory. Rooms exist for the meeting you're in right now.

When the container restarts, the following disappear:

- active rooms and their state
- connected participants
- revealed and unrevealed votes
- in-progress round data

> This is intentional. YASP is not a planning system of record. It's the room
> you walk into, estimate, and walk out of. The work lives in your tracker,
> not here.

**Redis mode** (opt-in) does not change this philosophy. It stores TTL-bound
active state across a process restart — not history, not audit logs. One
instance only, until cross-node coordination is explicitly solved. See
[docs/horizontal-scaling.md](./docs/horizontal-scaling.md).

---

## 🧰 Run It Your Way

**One-off session** — gone on `Ctrl-C`:

```bash
docker run --rm -p 3001:3001 wleonhardt/yasp:main
```

**Persistent background service** — survives reboots:

```bash
docker run -d --restart unless-stopped --name yasp -p 3001:3001 wleonhardt/yasp:main
```

**Build locally:**

```bash
docker build -t yasp:local .
docker run --rm -p 3001:3001 yasp:local
```

**Apple Silicon note:** add `--platform linux/amd64` if you need the x86_64 image target.

---

## 🔧 Local Development

Prerequisites: **Node.js 20+**, **npm 9+**

```bash
git clone https://github.com/wleonhardt/YASP.git yasp
cd yasp
npm install
npm run dev
```

Starts two things:

```
  http://localhost:3001  ← Fastify + Socket.IO server
  http://localhost:5173  ← Vite dev client
```

### Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Client + server in watch mode |
| `npm test` | Script tests + server Vitest + client Vitest |
| `npm run test:a11y` | Playwright accessibility smoke suite |
| `npm run i18n:check` | Validate locale keys and placeholders |
| `npm run lint` | ESLint, zero warnings |
| `npm run build` | Production build for shared, server, and client |
| `npm run format:check` | Prettier verification |

No `.env` file required for the default memory profile.

---

## ⚙️ Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | HTTP + WebSocket listen port |
| `HOST` | `0.0.0.0` | Bind address |
| `YASP_STATE_BACKEND` | `memory` | `memory` or `redis` |
| `REDIS_URL` | — | Required when backend is `redis` |
| `NODE_ENV` | unset locally | Set to `production` in Docker/prod |

---

## 📡 Runtime Profiles

| Profile | Status | Stores | Does not provide |
|---|---|---|---|
| `memory` | ✅ default | Active rooms in-process | History · multi-instance |
| `redis` | ⚙️ opt-in | Active room + session state with TTL | History · true horizontal scale |

**Important:** `redis` mode is still single-instance. Multiple app nodes pointed
at the same Redis remain out of scope until cross-node fanout, timer ownership,
and write coordination are explicitly solved.

See [docs/horizontal-scaling.md](./docs/horizontal-scaling.md) and [plans/decisions/](./plans/decisions/).

---

## 🏗️ Architecture

```
  ┌──────────────────────────────────────────────────────┐
  │                     Browser                          │
  │         React 18 + Vite SPA  (port 5173/dev)         │
  └─────────────────────┬────────────────────────────────┘
                        │  HTTP + Socket.IO
  ┌─────────────────────▼────────────────────────────────┐
  │              Fastify + Socket.IO Server               │
  │                   (port 3001)                         │
  │                                                       │
  │   Server is authoritative. Clients send commands:    │
  │   cast_vote · reveal_votes · timer actions · etc.    │
  │   Server validates + broadcasts updated room state.  │
  └─────────────────────┬────────────────────────────────┘
                        │  optional
  ┌─────────────────────▼────────────────────────────────┐
  │               Redis (TTL-bound state)                 │
  │           YASP_STATE_BACKEND=redis only               │
  └──────────────────────────────────────────────────────┘
```

| Layer | Technology |
|---|---|
| Client | React 18 + Vite |
| Server | Fastify + Socket.IO |
| Shared contracts | TypeScript project references (`shared/`) |
| Runtime | Node.js 20+ |
| Default deploy | Single Docker container |
| Optional infra | AWS CDK (`cdk/`) |

`sessionId` is a browser continuity token stored in `localStorage`.
It powers reconnect and latest-tab-wins continuity. It is not an account or identity proof.

---

## 📁 Repository Layout

```
yasp/
├── client/   React + Vite SPA
├── server/   Fastify + Socket.IO runtime and tests
├── shared/   Shared types and event contracts
├── cdk/      Optional AWS deployment stack
├── docs/     Focused deep-dive docs
├── plans/    ADRs, queue, and open questions
└── tests/    Script- and Playwright-based checks
```

---

## 🐳 Docker Image

Published tags:

| Tag | What it is |
|---|---|
| `main` | Rolling image from current `main` branch |
| `<short-sha>` | Immutable commit-pinned image for rollback/debug |

The image runs hardened by default:

```
--read-only  --tmpfs /tmp:size=64m  --cap-drop ALL  --memory 512m
```

---

## ❤️ Health Endpoint

```
GET /api/health  →  { "ok": true }
```

```yaml
# Docker Compose healthcheck
healthcheck:
  test: ["CMD", "curl", "-sf", "http://localhost:3001/api/health"]
  interval: 30s
  timeout: 5s
  retries: 3
```

The image includes a Docker `HEALTHCHECK` out of the box.

---

## ☁️ Deployment

**Plain Docker** — the simplest supported path. One container, `memory` mode,
no extra infrastructure.

**AWS / CDK** — optional CloudFront + WAF + Basic Auth + single EC2 + nginx +
Docker path. See [cdk/README.md](./cdk/README.md). The CDK stack deploys
memory-only by default — Redis support is not wired in until the profile is
honestly more than single-instance.

Operational runbook → [docs/operations-runbook.md](./docs/operations-runbook.md)
Branch protection + CI gates → [docs/branch-protection.md](./docs/branch-protection.md)

---

## 🔒 Security Posture

YASP is **intentionally no-auth:**

- room URLs are bearer-style meeting links
- `sessionId` is continuity, not identity proof
- moderators are a room-level role, not an authenticated account

Within that boundary, hardening includes:

- CSP and browser security headers
- input validation and abuse shaping
- non-root container image + hardened runtime flags
- healthcheck-based deploy rollback
- layered CI/security scanning

What YASP does **not** claim:

- strong user authentication
- durable privacy guarantees beyond bearer-link secrecy
- history or audit-trail persistence
- true multi-instance readiness

Security docs → [SECURITY_THREAT_MODEL.md](./SECURITY_THREAT_MODEL.md) · [SECURITY_AUDIT_REPORT.md](./SECURITY_AUDIT_REPORT.md) · [docs/security-scanning.md](./docs/security-scanning.md)

---

## ✅ CI & Quality Gates

**Blocking checks:**

| Check | What it gates |
|---|---|
| `validate` | Translations · lint · build · tests · format |
| `a11y-smoke` | Playwright accessibility smoke coverage |
| `docker-validation` | Production image build + healthcheck + root doc |
| `cdk-synth` | CDK stack synthesis (on `cdk/` changes) |
| `CodeQL` | Security query pack |

**Advisory lanes** (not yet blocking): dependency review · Trivy scans · `npm audit` · strict lint · Knip · OSSF Scorecard.

Planned blocker promotion order: `npm audit` → `lint:strict` → `knip`. OSSF stays advisory.

Every PR also gets two advisory signals: **client bundle size report** and a **7-day preview artifact** of `client/dist/`.

Source of truth → [docs/security-scanning.md](./docs/security-scanning.md)

---

## 🦾 Accessibility

- Keyboard-operable core flows
- Semantic landmarks and route-aware titles
- Live-region announcements for room-state changes
- Reduced-motion handling
- Forced-colors fallbacks
- Automated smoke coverage via `npm run test:a11y`

> YASP should **not** be described as WCAG-conformant yet. Browser/manual QA
> is complete for core flows; real assistive-technology validation is still
> outstanding in some areas.

Audit docs → [ACCESSIBILITY_WCAG_2_2_AAA_AUDIT.md](./ACCESSIBILITY_WCAG_2_2_AAA_AUDIT.md) · [ACCESSIBILITY_MANUAL_QA_CHECKLIST.md](./ACCESSIBILITY_MANUAL_QA_CHECKLIST.md)

---

## 🌍 Localization

Powered by `i18next` + `react-i18next`. English is the source and fallback locale.

| | Locale | | Locale |
|---|---|---|---|
| 🇺🇸 | `en` — English | 🇯🇵 | `ja` — Japanese |
| 🇪🇸 | `es` — Spanish | 🇰🇷 | `ko` — Korean |
| 🇫🇷 | `fr` — French | 🇨🇳 | `zh-Hans` — Simplified Chinese |
| 🇩🇪 | `de` — German | 🇹🇼 | `zh-Hant` — Traditional Chinese |
| 🇧🇷 | `pt` — Portuguese | | |

`npm run i18n:check` is enforced in CI. Terminology guidance → [docs/i18n-glossary.md](./docs/i18n-glossary.md)

---

## 🔁 Realtime Recovery

YASP keeps the healthy connection path quiet. Recovery UI only appears when the live room connection is unhealthy.

- **Retry** — another normal reconnect attempt
- **Compatibility mode** — current-tab fallback using polling transport (not a permanent mode or global preference)
- **Connection details** — non-sensitive diagnostics: status, transport, retry count, health probe result, timestamps, and endpoint

Likely causes of disconnection are described cautiously: browser extensions, proxies, VPNs, or network policy can interfere with realtime transports.

---

## 📋 Round Reports

Round detail access is intentionally small and ephemeral:

- moderators get `View round report` after reveal (CSV / JSON / Print export)
- participants get `View round summary` after reveal (view-only, no export)
- resetting or advancing the round removes the current round detail entry point
- **export before reset/next round** if you need to keep a copy

---

## 🤝 Contributing

Before making structural changes:

1. Read [plans/next-up.md](./plans/next-up.md)
2. Read [plans/open-questions.md](./plans/open-questions.md)
3. Check accepted ADRs in [plans/decisions/](./plans/decisions/)

Before marking work done:

```bash
npm test && npm run lint && npm run build
```

Update docs/plans if product or operational behavior changed.

AI-agent repo rules → [AGENTS.md](./AGENTS.md)

---

## 📄 License

MIT — see [LICENSE](./LICENSE).

---

<div align="center">

```
  Pull it.  Run it.  Estimate.  Shut it down.  Done.
```

</div>
