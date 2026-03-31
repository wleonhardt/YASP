# YASP — Yet Another Scrum Poker

A lightweight, real-time scrum poker app. No accounts, no database — just create a room and estimate.

**Try it now at [app.yasp.team](https://app.yasp.team/)**

## Why YASP?

Most planning poker tools require sign-ups, store your data, and charge per seat. YASP is a single Docker container with zero external dependencies. All state lives in memory, the server is authoritative, and rooms expire automatically. Deploy it yourself or use the hosted version.

## Features

- **Rooms** — create by code, join by link, no account required
- **Voting** — hidden until reveal, change freely before reveal
- **Shared round timer** — moderator-controlled countdown with presets, pause/reset, optional sound cues, manual beep, and auto-reveal at expiry
- **Decks** — Fibonacci, Modified Fibonacci, T-shirt sizes, Powers of Two, with per-room customization (cap, toggles, fully custom cards)
- **Stats** — average, median, mode, spread, consensus detection, distribution chart
- **Roles** — vote as a participant or observe as a spectator
- **Moderator controls** — reveal, reset, next round, transfer host
- **Auto-transfer** — moderator role passes automatically on disconnect and restores on reconnect
- **Dark / light theme** — toggle with localStorage persistence
- **Accessibility foundations** — semantic landmarks, keyboard-operable controls, live announcements, reduced-motion support, forced-colors fallbacks
- **Reconnect** — refresh or lose connection and rejoin your session automatically
- **Auto-expiry** — inactive rooms are cleaned up, no manual teardown

## Tech Stack

| Layer   | Technology                     |
| ------- | ------------------------------ |
| Client  | React 19, Vite, TypeScript     |
| Server  | Fastify, Socket.IO, TypeScript |
| Shared  | TypeScript (project references) |
| Runtime | Node.js 20+                    |
| Deploy  | Docker (node:20-alpine)         |

## Architecture

YASP runs as a single Node.js process. Fastify serves the static client bundle and exposes HTTP endpoints. Socket.IO handles all real-time communication.

```
┌─────────────────────────────────────────────┐
│  Browser (React SPA)                        │
│  ├── LandingPage  — create / join           │
│  └── RoomPage     — vote / reveal / manage  │
└────────────┬────────────────────────────────┘
             │ Socket.IO (WebSocket)
┌────────────▼────────────────────────────────┐
│  Fastify + Socket.IO  (single process)      │
│  ├── Room state (in-memory Map)             │
│  ├── Session service (socket → identity)    │
│  ├── Cleanup service (periodic GC)          │
│  └── Static file serving (production)       │
└─────────────────────────────────────────────┘
```

The server is authoritative — clients send commands (`cast_vote`, `reveal_votes`, `start_timer`, etc.) and receive the full room state snapshot in response. Each browser tab generates a stable `sessionId` in `localStorage`, allowing the server to rebind returning users after a refresh or disconnect.

## Project Structure

```
yasp/
├── shared/       # Domain types, event contracts, deck definitions
├── server/       # Fastify + Socket.IO, room logic, tests
├── client/       # React SPA (Vite)
├── cdk/          # AWS CDK deployment (optional)
├── Dockerfile
└── package.json  # npm workspaces root
```

## Getting Started

**Prerequisites:** Node.js 20+, npm 9+

```bash
git clone https://github.com/wleonhardt/YASP.git yasp
cd yasp
npm install
npm run dev
```

This starts both the server (port 3001) and Vite dev server (port 5173). Open [http://localhost:5173](http://localhost:5173).

```bash
npm test             # Run tests
npm run i18n:check   # Validate locale files against English
npm run lint         # ESLint
npm run format:check # Prettier check
npm run build        # Production build (shared → server → client)
npm start            # Start production server on :3001
```

## Quality Checks

The repo includes a gated GitHub Actions pipeline:

- `CI` runs on pull requests and pushes to `main`
- validation includes build, tests, ESLint, and Prettier checks
- Docker validation builds the production image, starts it, and verifies `GET /api/health` plus the root HTML document
- `cdk synth` runs when files under [`cdk/`](./cdk/) change
- image publish and AWS deploy only run after CI passes

## Accessibility

YASP has an active [WCAG 2.2 AAA audit](./ACCESSIBILITY_WCAG_2_2_AAA_AUDIT.md). The current UI includes:

- semantic `main`/section landmarks and route-aware document titles
- keyboard-operable radio groups, tablists, modal focus trapping, and visible focus styles
- live-region announcements for room-state changes
- reduced-motion handling and forced-colors fallbacks
- dark/light theme support with stronger contrast-oriented tokens than the original baseline

The app is in much better shape than the initial audit baseline, but it is **not claimed as WCAG 2.2 AAA conformant yet**. Manual assistive-technology validation is still required before making that claim.

## Localization

YASP uses a lean, git-based localization setup built on `i18next` + `react-i18next`.

- locale files live in [`client/src/i18n/locales/`](./client/src/i18n/locales/)
- Phase 1 uses a single namespace: `common.json`
- English (`en`) is the default and fallback locale
- Supported locales are `en`, `es`, `fr`, `de`, `pt`, `ja`, `ko`, `zh-Hans`, and `zh-Hant`
- translations are bundled with the client and reviewed in pull requests
- no hosted translation service, sync platform, or runtime locale fetching is used
- English is the source locale, supported locales must stay in sync with it, and `npm run i18n:check` is enforced in CI
- Chinese is handled as two explicit locale variants: `zh-Hans` (Simplified) and `zh-Hant` (Traditional)

Language selection:

- the selected language is stored in `localStorage`
- on startup, YASP uses the stored locale first
- if no locale was stored, YASP falls back to the browser language only when it matches a supported locale
- browser locale normalization maps `ko-KR` to `ko`, `zh-CN` and `zh-SG` to `zh-Hans`, `zh-TW`, `zh-HK`, and `zh-MO` to `zh-Hant`, and plain `zh` to `zh-Hans`
- otherwise it falls back to English

To add a new string:

1. Add a stable key to [`client/src/i18n/locales/en/common.json`](./client/src/i18n/locales/en/common.json).
   Prefer semantic keys grouped by feature or screen, such as `landing.createRoom`, rather than English sentence keys.
2. Add the translated value to each additional locale file.
3. Use `t("your.key")` from `useTranslation()` in the client component.
4. Run `npm run i18n:check` to verify keys, placeholders, and empty-string rules.

To add a new language:

1. Add a new locale file under [`client/src/i18n/locales/`](./client/src/i18n/locales/).
2. Register it in [`client/src/i18n/index.ts`](./client/src/i18n/index.ts).
3. Add the locale code to [`client/src/i18n/config.ts`](./client/src/i18n/config.ts).
4. Add its visible label to the locale JSON files so the switcher exposes the new language consistently.

Terminology guidance for future translation work lives in [docs/i18n-glossary.md](./docs/i18n-glossary.md).

## Configuration

| Variable   | Default    | Description                  |
| ---------- | ---------- | ---------------------------- |
| `PORT`     | `3001`     | HTTP + WebSocket listen port |
| `HOST`     | `0.0.0.0` | Bind address                 |
| `NODE_ENV` | —          | Set to `production` in Docker |

No `.env` file is required. All defaults work out of the box.

## Docker

```bash
docker run --rm -p 3001:3001 wleonhardt/yasp:main
```

Open [http://localhost:3001](http://localhost:3001). All room state is in-memory — restarting the container clears everything. This is by design.

On Apple Silicon, use the x86_64 image target explicitly:

```bash
docker run --rm --platform linux/amd64 -p 3001:3001 wleonhardt/yasp:main
```

For reproducible deployments, prefer an explicit published SHA tag over the moving `main` tag.

Build locally:

```bash
docker build -t yasp:local .
docker run --rm -p 3001:3001 yasp:local
```

Health check endpoint: `GET /api/health` returns `{ "ok": true }`.

## AWS Deployment (Optional)

A CDK stack under [`cdk/`](./cdk/) deploys YASP behind CloudFront on a single EC2 instance with WAF and Basic Auth. See the [CDK README](./cdk/README.md).

The deployed origin now ships container logs to CloudWatch Logs. With the default stack settings you can inspect recent origin logs with:

```bash
aws logs tail /yasp/origin --since 1h --follow
```

## Roadmap

- [x] Custom deck creation from the UI
- [x] WCAG 2.2 audit and core accessibility remediation pass
- [x] Timer for voting rounds
- [ ] Room settings panel (reveal policy, name change policy)
- [ ] Manual assistive-technology validation (VoiceOver, TalkBack, zoom/reflow, speech input)
- [ ] Horizontal scaling with Redis adapter (opt-in)

## The YASP Promise

Scrum poker is one of the most misused ceremonies in software. Teams adopt it hoping to improve estimation, then watch it devolve into anchoring, pressure to converge, velocity tracking as a performance metric, or a rubber stamp for deadlines already set. The tool isn't the problem — it's how it's wielded.

YASP exists to make estimation conversations fast and frictionless, but the tool only works if the intent is right. So:

> *I solemnly swear not to use Scrum Poker to force certainty, measure people, justify deadlines, or replace real conversation. I will use it only to expose uncertainty, surface assumptions, and improve shared team understanding.*

If your estimate sparked a discussion, the round was a success — even if you never reached consensus.

## License

MIT — see [LICENSE](./LICENSE).
