# YASP — Yet Another Scrum Poker

A lightweight, self-hostable scrum poker app for agile teams. No accounts, no database, no external dependencies — just create a room and start estimating.

## Why YASP?

Most planning poker tools are SaaS products that require sign-ups, store your data, and charge per seat. YASP takes a different approach: it's a single Docker container with zero external dependencies. All state lives in memory, the server is authoritative, and the entire stack is TypeScript. Deploy it on your own infrastructure in seconds and tear it down when you're done.

## Overview

YASP is a real-time collaborative estimation tool built for sprint planning. A moderator creates a room, shares the link, and the team votes on story points using a card deck. Votes stay hidden until the moderator reveals them, at which point statistics (average, mode, consensus, distribution) are computed and displayed.

The server owns all room state and pushes updates to clients over WebSocket. There is no database — rooms exist in memory and expire automatically after inactivity. A browser refresh reconnects you to your session without losing your place.

## Features

- **Create & join rooms** — generate a room code or join by URL
- **Display names** — pick any name, no account required
- **Roles** — participate as a voter or observe as a spectator
- **Built-in decks** — Fibonacci, Modified Fibonacci, T-shirt sizes, Powers of Two
- **Hidden voting** — votes are invisible until the moderator reveals
- **Vote change** — update your vote freely before reveal
- **Reveal & stats** — see all votes with average, mode, consensus flag, and distribution
- **Reset round** — clear votes for re-estimation without advancing
- **Next round** — advance the round counter and start fresh
- **Reconnect** — rejoin automatically within the same browser session
- **Auto-expiry** — rooms with no connected participants are cleaned up after inactivity
- **Single-container deployment** — one process, one port, no moving parts

## Tech Stack

| Layer    | Technology                    |
| -------- | ----------------------------- |
| Client   | React 19, Vite, TypeScript    |
| Server   | Fastify, Socket.IO, TypeScript |
| Shared   | TypeScript (project references) |
| Runtime  | Node.js 20+                   |
| Deploy   | Docker (node:20-alpine)        |

## Architecture

YASP runs as a single Node.js process. Fastify serves the static client bundle and exposes health/config HTTP endpoints. Socket.IO handles all real-time room communication over WebSocket.

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

**Server-authoritative**: clients send commands (`cast_vote`, `reveal_votes`, etc.) and receive the full room state snapshot in response. The server validates permissions, enforces role restrictions, and computes stats.

**Session identity**: each browser tab generates a stable `sessionId` stored in `localStorage`. This allows the server to recognize a returning user after a page refresh or transient disconnect, re-binding them to their participant slot without requiring a login.

## Monorepo Structure

```
yasp/
├── shared/          # Domain types, event contracts, deck definitions
│   └── src/
├── server/          # Fastify + Socket.IO server, room logic, tests
│   └── src/
│       ├── domain/       # Stats, permissions, room model
│       ├── services/     # Room store, session, cleanup, timer
│       ├── transport/    # Socket handlers, serializers, validators
│       └── __tests__/
├── client/          # React SPA (Vite)
│   └── src/
│       ├── routes/       # LandingPage, RoomPage
│       ├── components/   # UI components
│       ├── hooks/        # useSocket, useSession, useRoom
│       └── lib/          # Storage, helpers
├── Dockerfile
├── package.json     # npm workspaces root
└── tsconfig.base.json
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm 9+

### Install

```bash
git clone <repo-url> yasp
cd yasp
npm install
```

### Run in Development

```bash
npm run dev
```

This starts both the server (port 3001) and the Vite dev server (port 5173) concurrently. Open [http://localhost:5173](http://localhost:5173) in your browser.

To run them separately:

```bash
npm run dev:server   # Fastify + Socket.IO on :3001
npm run dev:client   # Vite dev server on :5173 (proxies API/WS to :3001)
```

## Environment / Configuration

| Variable   | Default     | Description                     |
| ---------- | ----------- | ------------------------------- |
| `PORT`     | `3001`      | HTTP + WebSocket listen port    |
| `HOST`     | `0.0.0.0`  | Bind address                    |
| `NODE_ENV` | —           | Set to `production` in Docker   |

No `.env` file is required for development. All defaults work out of the box.

## Running Tests

```bash
npm test
```

Tests live in `server/src/__tests__/` and cover room logic, stats computation, permissions, session handling, and stale-socket enforcement.

## Production Build

```bash
npm run build    # Builds shared → server → client
npm start        # Starts the production server
```

In production mode, Fastify serves the client bundle as static files from `client/dist/` — no separate web server needed. The app is available on the configured `PORT` (default 3001).

## Docker

### Build

```bash
docker build -t yasp .
```

### Run

```bash
docker run -p 3001:3001 yasp
```

Open [http://localhost:3001](http://localhost:3001).

To use a different port:

```bash
docker run -p 8080:8080 -e PORT=8080 yasp
```

The image is based on `node:20-alpine` and runs as a single process with no external service dependencies.

## API / Health Endpoints

| Method | Path          | Description                          |
| ------ | ------------- | ------------------------------------ |
| GET    | `/api/health` | Returns `{ ok: true }` — use for container health checks |
| GET    | `/api/config` | Returns public server configuration  |

All room interaction happens over Socket.IO, not REST.

## Room Lifecycle & Persistence

**All room state is held in memory and is lost when the server restarts.** There is no database, no Redis, and no disk persistence. This is by design — YASP is meant for ephemeral planning sessions, not long-term storage.

Lifecycle details:

- **Room creation**: any connected user can create a room and becomes its moderator.
- **Joining**: participants join by room code or direct URL. Each gets a session identity stored in the browser's `localStorage`.
- **Reconnect**: if a participant refreshes the page or briefly loses connectivity, the server recognizes their `sessionId` and re-binds them to their existing participant slot (same name, role, and vote).
- **Disconnected grace period**: disconnected participants are kept for **30 minutes** before being removed by the cleanup service.
- **Room expiry**: rooms with no connected participants are cleaned up on a **5-minute** interval.
- **Moderator reassignment**: if the moderator leaves or is cleaned up, the server automatically promotes the next participant.

## Non-Goals

YASP is intentionally minimal. The following are explicitly out of scope:

- User accounts or authentication
- Persistent storage (database, Redis, filesystem)
- Chat or messaging
- Jira / issue tracker integration
- Vote history export
- Server-side rendering

## Roadmap

Potential future improvements (contributions welcome):

- [ ] Dark / light theme toggle
- [ ] Custom deck creation from the UI
- [ ] Timer for voting rounds
- [ ] Participant avatars
- [ ] Room settings panel (reveal policy, name change policy)
- [ ] Accessibility audit (keyboard nav, screen reader support)
- [ ] Horizontal scaling with Redis adapter (opt-in)

## License

<!-- TODO: Add a LICENSE file and update this section -->

No license specified yet. See `LICENSE` file when added.
