# Contributing to YASP

```
   ___  ___  _ __   ___ _ __ ___ 
  / __|/ _ \| '_ \ / __| '__/ __|
 | (__| (_) | | | | (__| |  \__ \
  \___|\___/|_| |_|\___|_|  |___/

  Pull requests welcome.  Bug reports welcome.  Translations welcome.
```

Thanks for wanting to make YASP better. This guide covers everything from
a quick translation fix to a full feature contribution.

---

## Table of Contents

- [Ways to Contribute](#ways-to-contribute)
- [Before You Start](#before-you-start)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Tests](#tests)
- [Code Style](#code-style)
- [Pull Request Process](#pull-request-process)
- [Translating YASP](#translating-yasp)
- [Reporting Bugs](#reporting-bugs)
- [Asking Questions](#asking-questions)

---

## Ways to Contribute

```
  ┌──────────────────────────────────────────────────────────────┐
  │                                                              │
  │  🐛  Found a bug?          Open an issue                    │
  │  💡  Have a feature idea?  Open an issue first, then PR     │
  │  🌍  Translation fix?      PR welcome, no issue needed      │
  │  📝  Docs improvement?     PR welcome, no issue needed      │
  │  🔒  Security issue?       See SECURITY.md (not a PR)       │
  │                                                              │
  └──────────────────────────────────────────────────────────────┘
```

For anything beyond a small isolated fix, **open an issue first**. It
saves everyone time if we agree a change is a good idea before you build it.

---

## Before You Start

Check these before proposing structural changes:

- [plans/next-up.md](./plans/next-up.md) — what's already queued or in progress
- [plans/open-questions.md](./plans/open-questions.md) — unresolved design questions
- [plans/decisions/](./plans/decisions/) — accepted ADRs (Architecture Decision Records)

If your proposal conflicts with an accepted ADR, that's worth discussing in
an issue before spending time on a PR.

---

## Development Setup

Prerequisites: **Node.js 20+**, **npm 9+**

```bash
git clone https://github.com/wleonhardt/YASP.git yasp
cd yasp
npm install
npm run dev
```

That's it. Two processes start:

```
  http://localhost:3001  ←  Fastify + Socket.IO (server)
  http://localhost:5173  ←  Vite (client, hot reload)
```

No `.env` file, no external services, no database. The default `memory`
profile runs entirely in-process.

### Optional: Redis profile

If you're working on Redis-specific code:

```bash
docker run -d -p 6379:6379 redis:7-alpine
YASP_STATE_BACKEND=redis REDIS_URL=redis://localhost:6379 npm run dev
```

---

## Project Structure

```
  yasp/
  ├── client/            React 18 + Vite SPA
  │   └── src/
  │       ├── components/   UI components
  │       ├── hooks/        useRoom · useSession · useSocket
  │       ├── i18n/         Locale files for all 9 languages
  │       └── routes/       LandingPage · RoomPage
  │
  ├── server/            Fastify + Socket.IO runtime
  │   └── src/
  │       ├── room/         Room domain logic + RoomService
  │       ├── transport/    Socket handlers · rate limiting · validation
  │       └── state/        Memory and Redis backends
  │
  ├── shared/            Types and Socket.IO event contracts
  │   └── src/
  │       ├── types.ts      Room · Participant · PublicRoomState · etc.
  │       └── events.ts     All client-to-server event shapes
  │
  ├── cdk/              Optional AWS CDK deployment stack
  ├── docs/             Operational and contributor docs
  ├── plans/            ADRs · work queue · open questions
  └── tests/            Script-level and Playwright checks
```

`shared/` is the contract layer. Both `server/` and `client/` depend on it.
Change types or events there and both sides need to stay in sync.

---

## Making Changes

### Small changes (docs, translations, isolated bug fixes)

Just make the change and open a PR. No issue required.

### Features or anything structural

1. Open an issue describing what you want to build and why
2. Wait for a thumbs-up before investing significant time
3. Reference the issue in your PR

### Domain model or architecture changes

Read the ADRs first. Open an issue. These need discussion.

---

## Tests

```bash
npm test               # all unit + integration tests
npm run test:a11y      # Playwright accessibility smoke suite
npm run i18n:check     # validate locale key parity and placeholders
```

All three must pass before a PR will merge. CI runs them automatically.

### What to test

- New server-side behavior → Vitest in `server/src/`
- New client components → Vitest + React Testing Library in `client/src/`
- Redis-specific paths → use `ioredis-mock` for fast coverage

### Redis integration tests

The CI suite runs live Redis integration tests. Locally, `ioredis-mock`
covers the contract fast. See [docs/redis-integration-testing.md](./docs/redis-integration-testing.md).

---

## Code Style

```bash
npm run lint           # ESLint — must be zero warnings
npm run format:check   # Prettier verification
```

Lint and format are enforced in CI. Run them locally before pushing to
avoid a red CI run on a trivial whitespace issue.

A few conventions worth knowing:

- TypeScript everywhere — no `any` without explicit justification
- Server is authoritative — client sends commands, server validates and broadcasts
- No persistence beyond TTL-bound active state — if your change tries to
  store history or audit logs, that's a product philosophy conversation first
- Match existing style — don't clean up adjacent code as part of a PR
- Comments only when the "why" is non-obvious — well-named code is its own
  documentation

---

## Pull Request Process

1. **Branch from `main`** — `git checkout -b your-feature main`
2. **One concern per PR** — splitting is almost always the right call
3. **Fill in the PR template** — describe what changed and why
4. **All checks green** — CI gates must pass (see blocking checks in README)
5. **Update docs** if you changed product or operational behavior

### Before-done checklist

```bash
npm test && npm run lint && npm run build
```

All three clean = ready to open the PR.

---

## Translating YASP

YASP ships in 9 languages. Translation contributions are very welcome.

**Locale files live here:**

```
  client/src/i18n/locales/
  ├── en.json    ← source of truth (English)
  ├── es.json
  ├── fr.json
  ├── de.json
  ├── pt.json
  ├── ja.json
  ├── ko.json
  ├── zh-Hans.json
  └── zh-Hant.json
```

**Workflow:**

1. Edit the target locale file (e.g. `fr.json`)
2. Keep every key that exists in `en.json` — extra keys are ignored but missing ones fail CI
3. Keep placeholder shapes identical: `{{count}}` in English → `{{count}}` in your translation
4. Run `npm run i18n:check` to verify parity before committing
5. Open a PR — a translation fix doesn't need a pre-existing issue

**Glossary** — keep these product terms stable across locales:

| Term | Meaning |
|---|---|
| `host` / `moderator` | The room facilitator who can reveal, reset, advance rounds |
| `room` | A planning poker session |
| `reveal` | Show hidden votes to the room |
| `spectator` | An observer who cannot vote |
| `voter` | A participant who can choose a card |
| `custom deck` | A user-configured set of planning cards |
| `coffee card` | The special break card |
| `round` | The current voting cycle inside a room |
| `session replaced` | This tab lost control to another tab for the same session |

Full glossary → [docs/i18n-glossary.md](./docs/i18n-glossary.md)

---

## Reporting Bugs

Open a [GitHub issue](https://github.com/wleonhardt/yasp/issues) with:

- What you did
- What you expected to happen
- What actually happened
- Browser / OS if it's a UI bug
- Any console errors if present

For the connection/realtime bugs, the `Connection details` panel in the
app's recovery notice has non-sensitive diagnostics. Including that output
is extremely helpful.

---

## Reporting Security Issues

**Do not open a public issue for security vulnerabilities.**

Report them via [GitHub Security Advisories](https://github.com/wleonhardt/yasp/security/advisories/new).
See [SECURITY.md](./SECURITY.md) for the full policy.

---

## Asking Questions

Open a [GitHub issue](https://github.com/wleonhardt/yasp/issues) with the
`question` label. There's no separate discussion forum — issues are the right
place.

---

## License

By contributing to YASP, you agree your contributions will be licensed
under the [MIT License](./LICENSE).
