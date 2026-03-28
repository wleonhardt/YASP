# YASP — Yet Another Scrum Poker

A lightweight, real-time scrum poker app. No accounts, no database — just create a room and estimate.

**Try it now at [app.yasp.team](https://app.yasp.team/)**

## Why YASP?

Most planning poker tools require sign-ups, store your data, and charge per seat. YASP is a single Docker container with zero external dependencies. All state lives in memory, the server is authoritative, and rooms expire automatically. Deploy it yourself or use the hosted version.

## Features

- **Rooms** — create by code, join by link, no account required
- **Voting** — hidden until reveal, change freely before reveal
- **Decks** — Fibonacci, Modified Fibonacci, T-shirt sizes, Powers of Two
- **Stats** — average, median, mode, spread, consensus detection, distribution chart
- **Roles** — vote as a participant or observe as a spectator
- **Moderator controls** — reveal, reset, next round, transfer host
- **Auto-transfer** — moderator role passes automatically on disconnect and restores on reconnect
- **Dark / light theme** — toggle with localStorage persistence
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

The server is authoritative — clients send commands (`cast_vote`, `reveal_votes`, etc.) and receive the full room state snapshot in response. Each browser tab generates a stable `sessionId` in `localStorage`, allowing the server to rebind returning users after a refresh or disconnect.

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
npm run build        # Production build (shared → server → client)
npm start            # Start production server on :3001
```

## Configuration

| Variable   | Default    | Description                  |
| ---------- | ---------- | ---------------------------- |
| `PORT`     | `3001`     | HTTP + WebSocket listen port |
| `HOST`     | `0.0.0.0` | Bind address                 |
| `NODE_ENV` | —          | Set to `production` in Docker |

No `.env` file is required. All defaults work out of the box.

## Docker

```bash
docker run --rm -p 3001:3001 wleonhardt/yasp:latest
```

Open [http://localhost:3001](http://localhost:3001). All room state is in-memory — restarting the container clears everything. This is by design.

Build locally:

```bash
docker build -t yasp:local .
docker run --rm -p 3001:3001 yasp:local
```

Health check endpoint: `GET /api/health` returns `{ "ok": true }`.

## AWS Deployment (Optional)

A CDK stack under [`cdk/`](./cdk/) deploys YASP behind CloudFront on a single EC2 instance with WAF and Basic Auth. See the [CDK README](./cdk/README.md).

## Roadmap

- [ ] Custom deck creation from the UI
- [ ] Timer for voting rounds
- [ ] Room settings panel (reveal policy, name change policy)
- [ ] Accessibility audit (keyboard nav, screen reader support)
- [ ] Horizontal scaling with Redis adapter (opt-in)

## License

MIT — see [LICENSE](./LICENSE).
