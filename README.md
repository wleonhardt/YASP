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
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/12783/badge)](https://www.bestpractices.dev/projects/12783)

**Lightweight · Realtime · Self-hosted · Ephemeral by design**

🌐 **[app.yasp.team](https://app.yasp.team)** · 🐳 **[wleonhardt/yasp](https://hub.docker.com/r/wleonhardt/yasp)**

</div>

---

> *Planning poker should feel like a team ritual, not infrastructure management.*

YASP is a fast, no-fuss collaborative estimation tool. No accounts. No stored history. Show up, estimate together, leave. The work lives in your tracker, not here.

---

## Who Is This For?

```
  ┌─────────────────────────────────────────────────────────────┐
  │                                                             │
  │   🧑‍💻  Just want to use it?    →  app.yasp.team            │
  │                                                             │
  │   🐳  Self-host it?            →  Quick Start below        │
  │                                                             │
  │   🏗️   Run it in production?   →  Deployment section       │
  │                                                             │
  │   🛠️   Hack on it?             →  Local Development        │
  │                                                             │
  │   🌍  Improve a translation?   →  Contributing guide       │
  │                                                             │
  └─────────────────────────────────────────────────────────────┘
```

---

## How a Room Works

```
  You        ─── create/join room ──►  Server  ◄── teammates join ───  Team
                                         │
                                    Server owns
                                    all room state
                                         │
  You pick a card        ◄──────── broadcasts ──────────►  teammates see
  (hidden until reveal)              updates              (their cards too)
                                         │
  Moderator hits Reveal  ──► all votes shown ──► stats: avg · median · mode
                                         │
                          Next round or call it done
```

No round data persists after reset. Export before you move on if you need a record.

---

## Feature Highlights

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
| 📋 | Round reports with CSV / JSON / Print export |
| 🌍 | Localized in 9 languages |
| 🦾 | Keyboard-navigable, live-region announcements |
| 🧼 | No database · No Redis · No external services needed |

---

## 🚀 Quick Start

```bash
docker run --rm -p 3001:3001 wleonhardt/yasp:main
```

Open → `http://localhost:3001`

Three things true once this command runs:

- a full scrum poker app is live
- nothing was installed on your machine
- nothing will remain when you stop it

---

## ☁️ Ephemeral by Design

```
  ┌──────────────────────────────────────────────────────────┐
  │   No accounts        No stored history                   │
  │   No database        No persistence layer                │
  │   No migrations      No infrastructure sprawl            │
  │   No stale rooms     No baggage                         │
  └──────────────────────────────────────────────────────────┘
```

All state lives in memory. Rooms exist for the meeting you're in right now. When the container restarts, rooms clear — and that's intentional.

> YASP is not a planning system of record. It's the room you walk into, estimate, and walk out of.

**Redis mode** (opt-in) doesn't change this philosophy. It stores TTL-bound active state across process restarts — not history, not audit logs. Single-instance only. See [docs/horizontal-scaling.md](./docs/horizontal-scaling.md).

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

**Apple Silicon:** add `--platform linux/amd64` if you need the x86_64 image target.

---

## 🏗️ Architecture

```
  ┌────────────────────────────────────────────────────────────┐
  │                        Browser                             │
  │           React 18 + Vite SPA  (port 5173/dev)            │
  └────────────────────────┬───────────────────────────────────┘
                           │  HTTP + Socket.IO
  ┌────────────────────────▼───────────────────────────────────┐
  │              Fastify + Socket.IO  (port 3001)              │
  │                                                            │
  │   Server is authoritative. Clients emit commands:         │
  │   cast_vote · reveal_votes · timer actions · etc.         │
  │   Server validates, updates state, broadcasts back.       │
  └────────────────────────┬───────────────────────────────────┘
                           │  optional (YASP_STATE_BACKEND=redis)
  ┌────────────────────────▼───────────────────────────────────┐
  │              Redis  (TTL-bound active state)               │
  │              single-instance · no history                  │
  └────────────────────────────────────────────────────────────┘
```

| Layer | Technology |
|---|---|
| Client | React 18 + Vite |
| Server | Fastify 5 + Socket.IO 4 |
| Shared contracts | TypeScript project refs (`shared/`) |
| Runtime | Node.js 20+ |
| Default deploy | Single Docker container |
| Optional infra | AWS CDK (`cdk/`) |

`sessionId` is a browser continuity token in `localStorage`. It powers reconnect and latest-tab-wins. It is not an account or identity proof.

---

## 📁 Repository Layout

```
  yasp/
  ├── client/    React + Vite SPA
  ├── server/    Fastify + Socket.IO runtime and tests
  ├── shared/    Shared TypeScript types and event contracts
  ├── cdk/       Optional AWS deployment stack
  ├── docs/      Deep-dive operational and contributor docs
  ├── plans/     ADRs, work queue, open questions
  └── tests/     Script-level and Playwright checks
```

---

## 🔧 Local Development

Prerequisites: **Node.js 20+**, **npm 9+**

```bash
git clone https://github.com/wleonhardt/YASP.git yasp
cd yasp
npm install
npm run dev
```

Starts two processes:
```
  http://localhost:3001  ←  Fastify + Socket.IO server
  http://localhost:5173  ←  Vite dev client (hot reload)
```

### Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Client + server in watch mode |
| `npm test` | Script tests + server Vitest + client Vitest |
| `npm run test:a11y` | Playwright accessibility smoke suite |
| `npm run i18n:check` | Validate locale key parity and placeholders |
| `npm run lint` | ESLint, zero warnings |
| `npm run lint:strict` | Type-aware rules (advisory) |
| `npm run build` | Production build (shared → server → client) |
| `npm run format:check` | Prettier verification |
| `npm run knip` | Unused files/exports/deps |

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

| Profile | Status | What it does | What it doesn't do |
|---|---|---|---|
| `memory` | ✅ default | Active rooms in-process | History · multi-instance |
| `redis` | ⚙️ opt-in | Active state with TTL, survives restarts | History · true horizontal scale |

`redis` mode is still **single-instance**. Multiple nodes pointed at the same Redis remain out of scope until cross-node fanout, timer ownership, and write coordination are solved. See [docs/horizontal-scaling.md](./docs/horizontal-scaling.md).

---

## 🐳 Docker Image

```
  Published tags:

  wleonhardt/yasp:main          Rolling build from main branch
  wleonhardt/yasp:<short-sha>   Immutable commit-pinned tag for rollback/debug
```

The image runs hardened by default — non-root user, read-only filesystem, dropped capabilities:

```bash
docker run --rm \
  --read-only --tmpfs /tmp:size=64m \
  --cap-drop ALL --memory 512m \
  -p 3001:3001 wleonhardt/yasp:main
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

The image ships a `HEALTHCHECK` out of the box.

---

## ☁️ Deployment

```
  ┌─────────────────────────────────────────────────────────────┐
  │  Option A: Plain Docker                                     │
  │  ─────────────────────                                      │
  │  One container. memory mode. Zero extra infra.             │
  │  The simplest supported path.                              │
  │                                                             │
  │  Option B: AWS / CDK                                        │
  │  ───────────────────                                        │
  │  CloudFront + WAF + Basic Auth + EC2 + nginx + Docker.     │
  │  See  cdk/README.md  for the full stack.                   │
  │  Memory-only by default — Redis not wired in by design.    │
  └─────────────────────────────────────────────────────────────┘
```

Operational runbook → [docs/operations-runbook.md](./docs/operations-runbook.md)  
Branch protection + CI gates → [docs/branch-protection.md](./docs/branch-protection.md)

---

## 🔒 Security Posture

YASP is **intentionally no-auth:**

- Room URLs are bearer-style meeting links
- `sessionId` is continuity, not identity proof
- Moderators are a room-level role, not an authenticated account

Within that boundary, hardening includes:

```
  CSP + browser security headers      Input validation + abuse shaping
  Non-root container image            Hardened runtime flags (--cap-drop ALL)
  Healthcheck-based deploy rollback   Layered CI security scanning
```

**What YASP does not claim:**

- Strong user authentication
- Durable privacy beyond bearer-link secrecy
- History, audit trails, or persistence
- True multi-instance readiness

Security docs → [SECURITY_THREAT_MODEL.md](./SECURITY_THREAT_MODEL.md) · [SECURITY_AUDIT_REPORT.md](./SECURITY_AUDIT_REPORT.md) · [docs/security-scanning.md](./docs/security-scanning.md)

---

## ✅ CI & Quality Gates

**Blocking checks — these must pass before any merge:**

| Check | What it covers |
|---|---|
| `validate` | Translations · lint · build · tests · format |
| `a11y-smoke` | Playwright accessibility smoke |
| `docker-validation` | Production image build + healthcheck |
| `cdk-synth` | CDK stack synthesis (on `cdk/` changes) |
| `CodeQL` | Security query pack (JS/TS) |

**Advisory lanes** (visible, not yet blocking): dependency review · Trivy scans · `npm audit` · strict lint · Knip · OSSF Scorecard.

Every PR gets two advisory signals: **client bundle size report** and a **7-day preview artifact** of `client/dist/`.

Full details → [docs/security-scanning.md](./docs/security-scanning.md)

---

## 🦾 Accessibility

```
  ✓ Keyboard-operable core flows
  ✓ Semantic landmarks + route-aware document titles
  ✓ Live-region announcements for room state changes
  ✓ Reduced-motion handling
  ✓ Forced-colors fallbacks
  ✓ Automated smoke coverage via  npm run test:a11y
```

> YASP should **not** be described as WCAG-conformant yet. Automated and browser/manual QA is complete for core flows; real assistive-technology validation is still outstanding in some areas.

Audit docs → [ACCESSIBILITY_WCAG_2_2_AAA_AUDIT.md](./ACCESSIBILITY_WCAG_2_2_AAA_AUDIT.md) · [ACCESSIBILITY_MANUAL_QA_CHECKLIST.md](./ACCESSIBILITY_MANUAL_QA_CHECKLIST.md)

---

## 🌍 Localization

Powered by `i18next` + `react-i18next`. English is the source and fallback locale. `npm run i18n:check` enforces key parity in CI.

| | Locale | | Locale |
|---|---|---|---|
| 🇺🇸 | `en` — English | 🇯🇵 | `ja` — Japanese |
| 🇪🇸 | `es` — Spanish | 🇰🇷 | `ko` — Korean |
| 🇫🇷 | `fr` — French | 🇨🇳 | `zh-Hans` — Simplified Chinese |
| 🇩🇪 | `de` — German | 🇹🇼 | `zh-Hant` — Traditional Chinese |
| 🇧🇷 | `pt` — Portuguese | | |

Translator terminology guide → [docs/i18n-glossary.md](./docs/i18n-glossary.md)

---

## 🔁 Realtime Recovery

Recovery UI only appears when the live room connection is unhealthy — the happy path stays completely silent.

```
  Disconnected?  →  Retry           (standard reconnect attempt)
                 →  Compatibility   (polling transport fallback for this tab)
                 →  Details         (non-sensitive diagnostics for support)
```

Common causes: browser extensions, VPNs, proxies, or network policies interfering with WebSocket upgrades.

---

## 📋 Round Reports

- **Moderators** get `View round report` after reveal — CSV / JSON / Print export available
- **Participants** get `View round summary` — view-only, no export
- Resetting or advancing the round removes the current report entry point

> **Export before reset/next round** if you need to keep the data.

---

## 🤝 Contributing

Want to contribute? See **[CONTRIBUTING.md](./CONTRIBUTING.md)** for the full guide.

Quick checklist before submitting a PR:

1. Read [plans/next-up.md](./plans/next-up.md) and [plans/open-questions.md](./plans/open-questions.md)
2. Check accepted ADRs in [plans/decisions/](./plans/decisions/)
3. Run `npm test && npm run lint && npm run build`
4. Update docs/plans if product or operational behavior changed

AI-agent repo rules → [AGENTS.md](./AGENTS.md)

---

## 📄 License

MIT — see [LICENSE](./LICENSE). Copyright 2026 William Leonhardt.

---

<div align="center">

```
  Pull it.  Run it.  Estimate.  Shut it down.  Done.
```

</div>
