# YASP — Agent Operations

> For AI coding agents. Human contributors: see [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## Instruction Priority

1. Hard rules in this file
2. Accepted decisions in `plans/decisions/`
3. `plans/open-questions.md` for unresolved threads
4. Existing code patterns — match the style you find

---

## Non-Negotiable Rules

### Code quality gates (all must pass before work is done)
- **`npm run build`** — full production build must succeed
- **`npm test`** — all Vitest tests (server + client + scripts) must pass
- **`npm run lint`** — zero warnings enforced
- **`npm run i18n:check`** — locale key parity must be valid after any translation change

### Architecture rules
- **TypeScript only** — no `.js` files in `src/`. Strict mode via `tsconfig.base.json`.
- **Workspace boundaries** — `shared/` owns types used by both sides. Never import server modules from client or vice versa. Route shared code through `shared/`.
- **Server is authoritative** — clients emit commands (`cast_vote`, `reveal_votes`, etc.). Server validates, updates state, broadcasts `PublicRoomState`. Never trust the client to compute or own state.
- **`PublicRoomState` is the contract** — the server never exposes internal `Room` or `Participant` directly. Serialize via the public state shape in `shared/src/types.ts`.
- **No durable external state** — the only approved exception is the opt-in Redis active-room/session backend (ADR 0003), which is ephemeral-only and single-instance. No databases, archives, history, or long-lived external state without an ADR.
- **No new services without an ADR** — if your change adds an infrastructure dependency or a new runtime service, write the ADR first.

### Planning rules
- **Check `plans/decisions/`** before proposing structural changes.
- **Check `plans/open-questions.md`** before starting work in an area with known open threads.
- **Plans are part of the contract** — keep them current. A feature that exists only in code is incomplete.
- **Project knowledge belongs in `plans/`** — design context, motivation, deferred decisions, open questions. If another contributor would need the information, it belongs in the repo.

### Commit discipline
- Commit after each meaningful change with a descriptive message.
- Branch from `main` for every change — direct commits to `main` are blocked by branch protection.
- All PRs must pass blocking CI checks before merge (see CI section below).

---

## Before Telling the User Work Is Done

```
  □  npm run build          succeeds
  □  npm test               passes
  □  npm run lint            zero warnings
  □  npm run i18n:check     passes (if any client/i18n change)
  □  Changes committed on a branch
  □  plans/next-up.md       completed items → Done; new items added if discovered
  □  plans/open-questions.md resolved questions answered; new ones added
  □  ADR created in plans/decisions/ if a structural or pattern decision was made
  □  Docs updated if product or operational behavior changed
```

---

## Context Recovery

When picking up an existing task or after compaction:

```bash
git --no-pager log --oneline -20    # recent history
cat plans/next-up.md                 # active queue
ls plans/decisions/                  # accepted ADRs
cat plans/open-questions.md          # unresolved threads
```

---

## Project Overview

Real-time scrum poker. No accounts. No persistence beyond TTL-bound active state.
Default mode keeps everything in process memory. Optional Redis mode stores only
active room/session state with TTL — still single-instance.

Default deployment: single Docker container at `app.yasp.team`.

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite (`client/`) |
| Backend | Node.js 20 + Fastify 5 + Socket.IO 4 (`server/`) |
| Shared contracts | TypeScript project refs (`shared/`) |
| Infrastructure | AWS CDK (`cdk/`) |
| Tests | Vitest (server + client) · Playwright a11y smoke |

---

## Workspace Structure

```
  yasp/
  ├── shared/       TypeScript types + Socket.IO event shapes
  │   └── src/
  │       ├── types.ts    Room · Participant · PublicRoomState · RevealStats
  │       └── events.ts   All client-to-server event shapes
  │
  ├── server/       Fastify + Socket.IO runtime
  │   └── src/
  │       ├── room/         RoomService + domain rules
  │       ├── transport/    Socket handlers · rate limiting · validation
  │       └── state/        Memory and Redis backends
  │
  ├── client/       React + Vite SPA
  │   └── src/
  │       ├── components/   UI components
  │       ├── hooks/        useRoom · useSession · useSocket
  │       ├── i18n/         9-locale translation files
  │       └── routes/       LandingPage · RoomPage
  │
  ├── cdk/          Optional AWS CDK deployment stack
  ├── docs/         Operational and contributor docs
  ├── plans/        ADRs · work queue · open questions
  └── tests/        Script-level and Playwright checks
```

---

## Key Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start client + server concurrently in watch mode |
| `npm run build` | Full production build (shared → server → client) |
| `npm test` | Unit + integration tests (Vitest) |
| `npm run test:a11y` | Playwright accessibility smoke suite |
| `npm run lint` | ESLint — zero warnings |
| `npm run lint:strict` | Type-aware rules (advisory in CI, run locally before PRs) |
| `npm run format` | Prettier format |
| `npm run format:check` | Prettier verification |
| `npm run i18n:check` | Validate locale key parity and placeholder shapes |
| `npm run knip` | Unused files/exports/deps |
| `npm run clean` | Remove all build artifacts |

---

## Architecture & Coding Patterns

### The server-authoritative model

```
  Client emits command   →  server validates  →  server updates state
                                                →  server broadcasts PublicRoomState
                                                   to all room participants
```

Never let the client compute or own authoritative state. If a client sends
bad input, the server rejects it — clients don't optimistically mutate local
room state.

### Where things live

- **Room domain logic** → `server/src/room/` (RoomService, domain types)
- **Socket event handling** → `server/src/transport/socket-handlers.ts`
- **Input validation** → `server/src/transport/validators.ts`
- **Rate limiting** → `server/src/transport/rate-limiter.ts`
- **State backends** → `server/src/state/` (memory-store.ts, redis-store.ts)
- **Shared event shapes** → `shared/src/events.ts`
- **Shared room types** → `shared/src/types.ts`

### Adding a new Socket.IO event

1. Define the event shape in `shared/src/events.ts`
2. Add the handler in `server/src/transport/socket-handlers.ts`
3. Add input validation in `server/src/transport/validators.ts`
4. Emit from the client using the typed event shape from `shared/`
5. Cover the new path in `server/` Vitest tests

### Adding a new room feature

1. Update domain types in `shared/src/types.ts` if needed
2. Implement in `server/src/room/RoomService` — keep domain logic there
3. Wire into socket handlers
4. Update `PublicRoomState` serializer if new fields need to reach clients
5. Update client-side hooks / components
6. Add tests for the domain logic path

### Session identity

`sessionId` is a UUID v4 stored in `localStorage`. It is a continuity
token for reconnect and latest-tab-wins, not an identity or auth proof.
Do not treat it as authentication. Moderator role is room-scoped only.

---

## Testing Patterns

### What to test

- **New server domain behavior** → Vitest in `server/src/`
- **New client components** → Vitest + React Testing Library in `client/src/`
- **Redis-specific paths** → use `ioredis-mock` for fast contract coverage;
  CI also runs live Redis integration tests

### Test style

- Co-locate tests with the code they cover (`*.test.ts` next to the module)
- Test behavior, not implementation — test what the handler does, not how
- Use `ioredis-mock` for Redis unit coverage; reserve live Redis for integration
- Do not mock `RoomService` in socket handler tests — test the real integration

### Running tests

```bash
npm test                  # all tests
npm run test:a11y         # Playwright a11y smoke (requires built client)
```

See [docs/redis-integration-testing.md](./docs/redis-integration-testing.md)
for Redis test patterns.

---

## Accessibility Rules

YASP targets WCAG 2.1 AA. These are non-optional for any UI change:

- All interactive elements keyboard-operable
- Semantic HTML — use `<button>` not `<div onClick>`
- Live regions for async room state changes
- Route changes update `document.title` (route-aware titles)
- Respect `prefers-reduced-motion`
- Forced-colors fallbacks for high-contrast mode
- Run `npm run test:a11y` before marking UI work done

See [ACCESSIBILITY_WCAG_2_2_AAA_AUDIT.md](./ACCESSIBILITY_WCAG_2_2_AAA_AUDIT.md)
for the current audit state.

---

## Localization Rules

All user-facing strings must be translated. When adding or modifying copy:

1. Add/update the English key in `client/src/i18n/locales/en.json` first
2. Propagate the same key + placeholder shape to all 8 other locale files
3. Run `npm run i18n:check` to verify parity
4. Keep product terms stable — see [docs/i18n-glossary.md](./docs/i18n-glossary.md)

Never hardcode user-facing strings in component JSX. Always use `t('key')`.

---

## Security Rules

- **No new `any` casts** without explicit justification
- **Validate all socket input** via `validators.ts` before passing to RoomService
- **Never expose internal Room/Participant** objects directly over the wire —
  always serialize via `PublicRoomState`
- **No secrets in source** — push protection is enabled; commits with secrets
  are rejected at the transport layer
- **No new external network calls** from server without review — the server
  intentionally has no outbound dependencies beyond optional Redis
- CSP headers are set in `server/src/app.ts` via Helmet — do not weaken them

Security posture → [SECURITY_THREAT_MODEL.md](./SECURITY_THREAT_MODEL.md)

---

## Redis Rules

Redis mode (`YASP_STATE_BACKEND=redis`) is a supported opt-in profile but:

- It remains **single-instance only** — do not document or imply it enables
  horizontal scale
- It stores **active state with TTL only** — no history, archives, or audit keys
- Approved Redis key prefixes: `yasp:room:{roomId}` · `yasp:session:{socketId}`
- Any new Redis key must use a TTL — no permanent keys

Multi-instance scale requires ADR-level work first. See
[docs/horizontal-scaling.md](./docs/horizontal-scaling.md) and ADR 0004.

---

## CI & Branch Protection

Branch `main` is protected. All changes go through reviewed PRs.

**Blocking CI checks (must pass before merge):**

| Check | What fails it |
|---|---|
| `validate` | Build · tests · lint · format · i18n |
| `a11y-smoke` | Playwright accessibility smoke failures |
| `docker-validation` | Production image build or healthcheck failure |
| `cdk-synth` | CDK stack synthesis failure (on `cdk/` changes) |
| `CodeQL` | Any security finding |

**Advisory checks** (non-blocking today, planned promotions):
`npm audit` → `lint:strict` → `knip` in that order.

Full details → [docs/security-scanning.md](./docs/security-scanning.md) ·
[docs/branch-protection.md](./docs/branch-protection.md)

---

## PR Workflow

```bash
# 1. Branch from main
git checkout -b your-feature main

# 2. Make changes, commit incrementally
git add <files>
git commit -m "feat: describe what changed"

# 3. Verify before pushing
npm test && npm run lint && npm run build

# 4. Push and open PR
git push -u origin your-feature
gh pr create --title "..." --body "..."
```

PRs need all blocking checks green + at least one approval to merge.

---

## Deployment Notes

- Default deploy: plain Docker (`wleonhardt/yasp:main`)
- AWS path: CDK stack in `cdk/` — memory-only by design
- Health endpoint: `GET /api/health` → `{ "ok": true }`
- Container runs non-root, read-only filesystem, dropped capabilities

Operations runbook → [docs/operations-runbook.md](./docs/operations-runbook.md)

---

## Generated Context

`repomix-output.xml` is generated agent context, not hand-authored source.
Use it for a fast repository overview. Regenerate with `repomix` from the
repo root. Do not manually edit it.
