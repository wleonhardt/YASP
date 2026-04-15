# YASP — Agent Operations

> For AI coding agents. Human contributors: see README.md.

## Instruction priority

1. This file's hard rules
2. Accepted decisions in `plans/decisions/`
3. `plans/open-questions.md` for unresolved threads

## Non-negotiable rules

- **Build must pass:** `npm run build` before telling the user work is done.
- **Tests must pass:** `npm test` (Vitest — server + client + scripts).
- **Lint must pass:** `npm run lint` (zero warnings enforced).
- **Check `plans/decisions/`** before proposing structural changes.
- **Check `plans/open-questions.md`** before starting work in an area with known open threads.
- **Plans are part of the contract** — keep them current. A feature that exists only in code is incomplete.
- **Project knowledge belongs in `plans/`** — design context, motivation, deferred decisions, open questions go here. If another contributor would need the information, it belongs in the repo.
- **Commit after each meaningful change** with a descriptive message.
- **TypeScript only** — no `.js` files in `src/`. Strict mode via `tsconfig.base.json`.
- **Workspace layout matters:** `shared/` owns types used by both client and server. Never import server modules from client or vice versa — route shared code through `shared/`.
- **No durable external state dependencies** — the default runtime is still
  in-memory only. The only approved exception is the opt-in Redis-backed active
  room/session backend documented in ADR 0003; it remains ephemeral-only and
  operationally single-instance. Do not introduce databases, history, archives,
  or external services without an ADR.

## Before telling the user work is done

1. `npm run build` succeeds.
2. `npm test` passes.
3. `npm run lint` passes (zero warnings).
4. Changes committed.
5. `plans/next-up.md` updated — completed items moved to Done, new items added if discovered.
6. `plans/open-questions.md` updated — resolved questions answered, new ones added.
7. ADR created in `plans/decisions/` if a structural or pattern decision was made.

## Context recovery

1. `git --no-pager log --oneline -20`
2. Read `plans/next-up.md`
3. Check `plans/decisions/` before proposing structural changes
4. Check `plans/open-questions.md` for unresolved threads

## Project overview

Real-time scrum poker. No accounts. Default mode keeps active state in memory;
optional Redis mode shares only TTL-bound active room/session state. Default
deployment is still a single Docker container.

- **Frontend:** React + Vite (`client/`)
- **Backend:** Node.js/Fastify + Socket.IO (`server/`)
- **Shared types:** `shared/`
- **Infrastructure:** AWS CDK (`cdk/`)
- **Tests:** Vitest (server + client), Playwright accessibility (`npm run test:a11y`)
- **Deployed:** app.yasp.team

## Key commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server (client + server concurrently) |
| `npm run build` | Full build (shared → server → client) |
| `npm test` | Unit + integration tests |
| `npm run test:a11y` | Playwright accessibility e2e |
| `npm run lint` | ESLint (zero warnings) |
| `npm run format` | Prettier format |
| `npm run format:check` | Prettier check |
| `npm run clean` | Remove all build artifacts |

## Workspace structure

```
yasp/
├── shared/       Shared TypeScript types (client + server)
├── server/       Node.js/Fastify + Socket.IO
├── client/       React + Vite SPA
├── cdk/          AWS CDK infrastructure
├── tests/        Playwright e2e + script tests
└── plans/        Planning docs (decisions, queue, questions)
```
