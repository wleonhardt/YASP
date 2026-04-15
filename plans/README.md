# Plans — YASP

Planning documentation for YASP (Yet Another Scrum Poker).

## Contents

| File | Purpose |
|------|---------|
| [decisions/](decisions/) | Architecture Decision Records (ADRs) |
| [next-up.md](next-up.md) | Working queue of tasks |
| [open-questions.md](open-questions.md) | Questions under investigation |

## Status Vocabulary

| Status | Meaning |
|--------|---------|
| proposed | Under consideration, not yet accepted |
| accepted | Approved, ready for implementation |
| in-progress | Actively being worked on |
| blocked | Waiting on something external |
| done | Complete |
| deferred | Postponed to a later phase |
| superseded | Replaced by a newer decision |

## Conventions

- Decisions are append-only — use `superseded` instead of deleting.
- `next-up.md` is the working queue. Check it first.
- Open questions are low-pressure. Add freely.
- Don't duplicate content across files. Link instead.
- Project knowledge belongs here, not in agent memory.
