# ADR 0001: Ephemeral Horizontal-Scaling Seams

- Status: accepted
- Date: 2026-04-14

## Context

YASP currently runs as a single-process app with in-memory room state. We want
to prepare for a future optional Redis-backed shared-state mode so multiple app
instances can serve the same active room without changing the product model.

That future mode must remain ephemeral:

- no room history
- no saved rounds
- no replay
- no audit log
- no accounts or authentication
- no general persistence layer

## Decision

We will introduce explicit server-side seams around the current in-memory
implementation while keeping local mode unchanged:

- `RoomStore`
- `SessionBindingStore`
- `ActiveRoomSessionResolver`
- `RoomTimerScheduler`
- `RoomStatePublisher`

The composition root will continue to instantiate only in-memory
implementations in local mode.

`RoomService` will explicitly save mutated room state through `RoomStore`
instead of relying on implicit shared-reference behavior. This keeps domain
logic compatible with future non-local store implementations.

## Consequences

- Current local behavior remains the default and must remain unchanged
- A future Redis-backed implementation can plug into the seams without
  rewriting socket handlers or room-domain logic
- Redis, when added later, is constrained to distributed ephemeral shared
  memory only
- Distributed write coordination and timer ownership are future design
  questions and are intentionally not solved in this ADR
