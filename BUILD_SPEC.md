# YASP Build Spec

## Goal

Build a lightweight, self-hostable scrum poker application with:

- single-instance deployment
- server-authoritative real-time state
- in-memory room storage only
- no persistence across process restarts
- reconnect continuity within the same browser session when possible

This spec defines the exact MVP boundary, internal domain model, Socket.IO contract, repository layout, and implementation phases.

## Product Scope

### In scope for v1

- create room
- join room by URL
- choose display name
- choose role: voter or spectator
- select deck: Fibonacci, modified Fibonacci, T-shirt, powers of two, custom
- cast vote
- hide votes until reveal
- reveal votes
- reset current round
- advance to next round
- show revealed stats
- copy/share room link
- reconnect within the same browser session
- automatic room expiration after inactivity

### Explicit non-goals for v1

- persistence across restarts
- user accounts or login
- authentication
- multiple server instances
- Redis
- database
- chat
- Jira integration
- exports
- moderator transfer
- round history persistence
- admin dashboard

## Hard Constraints

- Node.js 20+
- TypeScript across server and client
- single Node process
- no database
- no Redis
- no file persistence for room state
- no SSR requirement
- no background jobs outside the main process
- no ORM
- all room state must live in memory only

## Final Decisions

These v1 decisions are intentionally explicit to avoid ambiguity during implementation:

- `leave_room` removes the participant immediately, including their vote
- socket `disconnect` marks the participant disconnected and preserves the participant record only for the reconnect grace window
- if the same `sessionId` joins the same room from multiple tabs, the latest successful `join_room` takes over that participant identity
- duplicate display names are allowed in v1
- rooms with at least one connected participant do not expire, even if they are otherwise idle
- custom deck labels are normalized text values, not numeric values, so `"01"` and `"1"` remain distinct cards

## System Architecture

### Backend

- Fastify HTTP server
- Socket.IO server on the same process
- in-memory `RoomStore`
- cleanup interval for stale rooms and disconnected participants
- optional per-room auto-reveal timer owned by the server

### Frontend

- React SPA
- Vite build
- Socket.IO client
- local browser storage for stable session identity and preferred display name

### Deployment

- single Docker container
- one exposed HTTP port
- suitable for Fly.io, Railway, Render, or a small VPS

## Authoritative State Boundary

The server is authoritative for:

- room existence
- participant membership
- moderator assignment
- current deck
- current round number
- votes
- revealed state
- room settings
- room expiry

The client may store only:

- stable `sessionId`
- preferred `displayName`
- local UI state such as modal visibility

The client must never be trusted for:

- who is moderator
- whether a vote is valid
- whether an action is permitted
- computed reveal stats

## Domain Model

### Type aliases

```ts
export type RoomId = string;
export type ParticipantId = string;
export type SessionId = string;
export type SocketId = string;
export type VoteValue = string;
export type DeckType =
  | "fibonacci"
  | "modified_fibonacci"
  | "tshirt"
  | "powers_of_two"
  | "custom";
export type ParticipantRole = "voter" | "spectator";
export type PermissionPolicy = "moderator_only" | "anyone";
```

### Deck

```ts
export type Deck = {
  type: DeckType;
  label: string;
  cards: string[];
};
```

### Participant

`ParticipantId` is the stable room-local identity. For v1 it should equal the browser `SessionId` to avoid an unnecessary mapping layer.

```ts
export type Participant = {
  id: ParticipantId;
  sessionId: SessionId;
  name: string;
  role: ParticipantRole;
  connected: boolean;
  socketId: SocketId | null;
  joinedAt: number;
  lastSeenAt: number;
};
```

### Room settings

```ts
export type RoomSettings = {
  allowSpectators: boolean;
  allowNameChange: boolean;
  allowSelfRoleSwitch: boolean;
  revealPolicy: PermissionPolicy;
  resetPolicy: PermissionPolicy;
  deckChangePolicy: PermissionPolicy;
  autoReveal: boolean;
  autoRevealDelayMs: number;
};
```

### Room

```ts
export type Room = {
  id: RoomId;
  createdAt: number;
  lastActivityAt: number;
  expiresAt: number;
  revealed: boolean;
  roundNumber: number;
  title?: string;
  deck: Deck;
  settings: RoomSettings;
  moderatorId: ParticipantId | null;
  participants: Map<ParticipantId, Participant>;
  votes: Map<ParticipantId, VoteValue>;
};
```

### Public participant

```ts
export type PublicParticipant = {
  id: ParticipantId;
  name: string;
  role: ParticipantRole;
  connected: boolean;
  hasVoted: boolean;
  isSelf: boolean;
  isModerator: boolean;
};
```

### Reveal stats

```ts
export type RevealStats = {
  totalVotes: number;
  numericAverage: number | null;
  distribution: Record<string, number>;
  consensus: boolean;
  mostCommon: string | null;
};
```

### Public room state

Before reveal, `votes` and `stats` must be `null`.

```ts
export type PublicRoomState = {
  id: RoomId;
  title?: string;
  roundNumber: number;
  revealed: boolean;
  deck: Deck;
  settings: RoomSettings;
  participants: PublicParticipant[];
  votes: Record<ParticipantId, VoteValue> | null;
  stats: RevealStats | null;
  me: {
    participantId: ParticipantId | null;
    sessionId: SessionId;
    connected: boolean;
  };
};
```

## Default Decks

```ts
export const DEFAULT_DECKS: Record<Exclude<DeckType, "custom">, Deck> = {
  fibonacci: {
    type: "fibonacci",
    label: "Fibonacci",
    cards: ["0", "1", "2", "3", "5", "8", "13", "21", "34", "55", "89", "?", "coffee"],
  },
  modified_fibonacci: {
    type: "modified_fibonacci",
    label: "Modified Fibonacci",
    cards: ["0", "0.5", "1", "2", "3", "5", "8", "13", "20", "40", "100", "?", "coffee"],
  },
  tshirt: {
    type: "tshirt",
    label: "T-Shirt",
    cards: ["XS", "S", "M", "L", "XL", "XXL", "?", "coffee"],
  },
  powers_of_two: {
    type: "powers_of_two",
    label: "Powers of Two",
    cards: ["1", "2", "4", "8", "16", "32", "64", "?", "coffee"],
  },
};
```

## Default Room Settings

```ts
export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  allowSpectators: true,
  allowNameChange: true,
  allowSelfRoleSwitch: true,
  revealPolicy: "moderator_only",
  resetPolicy: "moderator_only",
  deckChangePolicy: "moderator_only",
  autoReveal: false,
  autoRevealDelayMs: 1500,
};
```

## Identity Model

### Client identity

The browser stores:

- `yasp.sessionId`
- `yasp.displayName`

`sessionId` must be generated once per browser storage context and reused for future reconnects.

### Reconnect contract

On every socket connection to a room, the client sends:

```ts
export type JoinRoomInput = {
  roomId: RoomId;
  sessionId: SessionId;
  displayName: string;
  requestedRole: ParticipantRole;
};
```

Server behavior:

1. Look up the room.
2. If the room does not exist, reject with `ROOM_NOT_FOUND`.
3. If a participant with the same `sessionId` already exists in the room:
   - rebind to the new socket
   - mark `connected = true`
   - preserve prior vote for the current round
4. Otherwise create a new participant.
5. If there is no moderator, assign the joined participant as moderator.

`socket.id` must never be used as participant identity.

### Same session in multiple tabs

When the same browser storage context opens the same room in multiple tabs, all tabs present the same `sessionId`.

v1 rule:

- latest successful `join_room` wins
- the existing participant record is rebound to the newest socket
- the previously bound socket is no longer authoritative for that room
- the server may emit `SESSION_REPLACED` to the previously bound socket
- commands from the previously bound socket must fail until that socket rejoins

This keeps the identity model simple and avoids duplicating one participant into multiple server-side records.

## Room Lifecycle

### Creation

Rooms are created explicitly by a `create_room` request. The server generates the ID.
`join_room` never creates a room in v1.

URL format:

- `/r/:roomId`

### Room ID rules

- 6 to 10 characters
- uppercase letters and digits only, or adjective-noun-number style IDs
- safe for URLs without encoding
- case-insensitive matching is not required if IDs are generated consistently

Recommended v1 format:

- `Q7KP9D`

### Expiration

Room timers:

- `ROOM_TTL_MS = 12 * 60 * 60 * 1000`
- `DISCONNECTED_PARTICIPANT_GRACE_MS = 30 * 60 * 1000`
- `CLEANUP_INTERVAL_MS = 5 * 60 * 1000`

On any meaningful room activity:

- update `lastActivityAt`
- set `expiresAt = now + ROOM_TTL_MS`

Cleanup removes:

- expired rooms whose `expiresAt <= now` and that have zero connected participants
- disconnected participants whose `lastSeenAt` is older than the grace window

Connected rooms do not expire in v1.

When a room transitions from one or more connected participants to zero connected participants:

- set `expiresAt = now + ROOM_TTL_MS`

If moderator was removed, assign the next connected participant by `joinedAt`. If none are connected, assign the next remaining participant by `joinedAt`. If none remain, set `moderatorId = null`.

## Round Model

The app stores only the current round.

Round state:

- `roundNumber`
- `revealed`
- `votes`

### Reset round

Reset keeps the current round number and clears current votes:

```ts
votes.clear();
revealed = false;
```

### Next round

Advance round:

```ts
votes.clear();
revealed = false;
roundNumber += 1;
```

No prior-round history is kept in v1.

## Permission Rules

### Moderator assignment

- first participant in the room becomes moderator
- moderator remains moderator across refreshes via stable `sessionId`
- moderator is reassigned immediately on voluntary leave if another participant remains
- moderator may also be reassigned during cleanup if the recorded moderator was removed as stale

### Action rules

#### Always allowed for self

- reconnect
- update own socket binding
- disconnect

#### Conditionally allowed

- change own name if `allowNameChange`
- change own role if `allowSelfRoleSwitch`
- spectators may exist only if `allowSpectators`

#### Controlled by policy

- reveal votes if `revealPolicy === "anyone"` or caller is moderator
- reset round if `resetPolicy === "anyone"` or caller is moderator
- next round follows the same rule as reset in v1
- change deck if `deckChangePolicy === "anyone"` or caller is moderator
- update settings is moderator-only in v1

## Vote Rules

When handling `cast_vote`:

- room must exist
- participant must exist
- participant must be connected
- participant role must be `voter`
- room must not be revealed
- vote value must be present in the active deck cards exactly

Effects:

- upsert vote in `room.votes`
- refresh room activity
- evaluate auto-reveal if enabled
- broadcast fresh `room_state`

Before reveal, clients see only `hasVoted`.
After reveal, clients receive the full `votes` map and computed `stats`.

## Stats Rules

Stats are computed server-side after reveal.

### Numeric parsing

Treat a vote as numeric only if `Number(value)` is finite and the original card label is a plain numeric string.

Examples:

- numeric: `"0"`, `"0.5"`, `"2"`, `"13"`
- non-numeric: `"?"`, `"coffee"`, `"XS"`

### Computation

```ts
export type RevealStats = {
  totalVotes: number;
  numericAverage: number | null;
  distribution: Record<string, number>;
  consensus: boolean;
  mostCommon: string | null;
};
```

Rules:

- `totalVotes` is count of all revealed votes
- `distribution` counts each exact vote label
- `numericAverage` is the arithmetic mean of numeric votes only, else `null`
- `consensus` is `true` if all revealed votes are identical and at least one vote exists
- `mostCommon` is the mode when there is a single winner, else `null`

## Auto-Reveal

Auto-reveal is part of the room settings and is server-owned.

When `autoReveal` is enabled:

1. After each accepted vote, inspect all connected voters.
2. If every connected voter has voted, schedule reveal after `autoRevealDelayMs`.
3. If any relevant condition changes before the timer fires, cancel and re-evaluate.

For auto-reveal evaluation, a participant counts only if all of the following are true at evaluation time:

- the participant record still exists in the room
- `connected === true`
- `role === "voter"`
- the participant is still bound to the active socket for that `sessionId`

Participants in transient reconnect windows do not count until they successfully rejoin.
If a participant disconnects, switches to spectator, or loses the active socket binding during the debounce window, the pending reveal must be cancelled and recalculated.

The timer must be stored in a server-only structure such as:

```ts
type AutoRevealTimerStore = Map<RoomId, NodeJS.Timeout>;
```

v1 may ship with `autoReveal = false` by default and a basic settings editor, or leave the UI toggle hidden while still supporting the setting server-side.

## Validation Rules

### Names

- trim leading and trailing whitespace
- min length `1`
- max length `30`
- reject all-whitespace names
- duplicate names are allowed

There is no server-side de-duplication or suffixing of names in v1.

### Custom deck

- normalize each label by trimming outer whitespace and collapsing internal whitespace runs to a single space
- card labels must be unique after normalization
- max `30` cards
- each card label max length `12`
- no empty labels
- uniqueness is case-sensitive after normalization
- vote equality and stats use the normalized stored label
- `"01"` and `"1"` are distinct because normalization is textual, not numeric

### Room IDs

- server-generated only for create flow
- join path must match safe format validation before use

### Votes

- exact string match against current deck cards
- spectators cannot vote
- votes after reveal are rejected

## Socket.IO Contract

## Transport Notes

- Use acknowledgement callbacks for commands that need immediate success or failure semantics.
- Use `room_state` as the canonical state event after every successful mutation.
- Optional UX events may be added later, but the client must work correctly from `room_state` alone.

### Client to server events

#### `create_room`

Creates a room and joins it immediately.

```ts
export type CreateRoomInput = {
  sessionId: SessionId;
  displayName: string;
  requestedRole: ParticipantRole;
  deck?: DeckInput;
};

export type CreateRoomOutput = {
  roomId: RoomId;
  state: PublicRoomState;
};
```

#### `join_room`

```ts
export type JoinRoomInput = {
  roomId: RoomId;
  sessionId: SessionId;
  displayName: string;
  requestedRole: ParticipantRole;
};

export type JoinRoomOutput = {
  state: PublicRoomState;
};
```

#### `leave_room`

Voluntary leave removes the participant immediately. Socket disconnect does not; it only marks the participant disconnected and starts the grace-window path to cleanup.

```ts
export type LeaveRoomInput = {
  roomId: RoomId;
};
```

#### `cast_vote`

```ts
export type CastVoteInput = {
  roomId: RoomId;
  value: VoteValue;
};
```

#### `clear_vote`

Optional but useful for v1. Lets a voter retract a hidden vote before reveal.

```ts
export type ClearVoteInput = {
  roomId: RoomId;
};
```

#### `reveal_votes`

```ts
export type RevealVotesInput = {
  roomId: RoomId;
};
```

#### `reset_round`

```ts
export type ResetRoundInput = {
  roomId: RoomId;
};
```

#### `next_round`

```ts
export type NextRoundInput = {
  roomId: RoomId;
};
```

#### `change_name`

```ts
export type ChangeNameInput = {
  roomId: RoomId;
  name: string;
};
```

#### `change_role`

```ts
export type ChangeRoleInput = {
  roomId: RoomId;
  role: ParticipantRole;
};
```

#### `change_deck`

```ts
export type DeckInput =
  | { type: "fibonacci" }
  | { type: "modified_fibonacci" }
  | { type: "tshirt" }
  | { type: "powers_of_two" }
  | { type: "custom"; label: string; cards: string[] };

export type ChangeDeckInput = {
  roomId: RoomId;
  deck: DeckInput;
};
```

#### `update_settings`

For v1, only moderator may change settings.

```ts
export type UpdateSettingsInput = {
  roomId: RoomId;
  settings: Partial<RoomSettings>;
};
```

#### `ping`

```ts
export type PingInput = {
  roomId?: RoomId;
  clientTs: number;
};
```

### Server to client events

#### `room_state`

Canonical state event sent:

- after successful `create_room`
- after successful `join_room`
- after any successful mutation
- after reconnect rebinding
- after relevant cleanup changes

```ts
export type RoomStateEvent = PublicRoomState;
```

#### `server_error`

```ts
export type ErrorCode =
  | "ROOM_NOT_FOUND"
  | "ROOM_EXPIRED"
  | "INVALID_NAME"
  | "INVALID_ROOM_ID"
  | "INVALID_ROLE"
  | "INVALID_DECK"
  | "INVALID_VOTE"
  | "SPECTATORS_DISABLED"
  | "NAME_CHANGE_DISABLED"
  | "ROLE_CHANGE_DISABLED"
  | "NOT_ALLOWED"
  | "ALREADY_REVEALED"
  | "NOT_REVEALED"
  | "PARTICIPANT_NOT_FOUND"
  | "SESSION_REPLACED"
  | "INTERNAL_ERROR";

export type ServerErrorEvent = {
  code: ErrorCode;
  message: string;
};
```

#### `pong`

```ts
export type PongEvent = {
  clientTs: number;
  serverTs: number;
};
```

### Ack convention

Each mutating client event should use a typed acknowledgement:

```ts
export type AckSuccess<T = undefined> = {
  ok: true;
  data: T;
};

export type AckFailure = {
  ok: false;
  error: ServerErrorEvent;
};

export type AckResult<T = undefined> = AckSuccess<T> | AckFailure;
```

Preferred behavior:

- command ack reports success or failure
- `room_state` event carries the authoritative updated snapshot

## Serialization Rules

Server-side serializer:

```ts
export function serializeRoom(room: Room, selfSessionId: SessionId): PublicRoomState;
```

Rules:

- sort participants by `joinedAt`, then by `name`
- mark `isSelf` from `selfSessionId`
- expose `hasVoted` from `room.votes.has(participant.id)`
- expose actual `votes` only if `room.revealed === true`
- compute `stats` only if `room.revealed === true`
- do not leak `socketId`
- do not leak server timer state

## HTTP Routes

The SPA can use a very small HTTP surface.

### API routes

- `GET /api/health`

### App routes

- `/`
- `/r/:roomId`

Server should serve the Vite-built static assets and return `index.html` for SPA routes.

## Repository Layout

```text
.
├── client/
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx
│       ├── main.tsx
│       ├── routes/
│       │   ├── LandingPage.tsx
│       │   └── RoomPage.tsx
│       ├── components/
│       │   ├── ConnectionBadge.tsx
│       │   ├── ParticipantGrid.tsx
│       │   ├── RoomControls.tsx
│       │   ├── RoomHeader.tsx
│       │   ├── SharePanel.tsx
│       │   ├── StatsPanel.tsx
│       │   └── VoteDeck.tsx
│       ├── hooks/
│       │   ├── useRoom.ts
│       │   ├── useSession.ts
│       │   └── useSocket.ts
│       ├── lib/
│       │   ├── api.ts
│       │   ├── room.ts
│       │   ├── socket.ts
│       │   └── storage.ts
│       ├── styles/
│       │   ├── globals.css
│       │   └── theme.css
│       └── types/
│           └── shared.ts
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── app.ts
│       ├── config.ts
│       ├── index.ts
│       ├── socket.ts
│       ├── domain/
│       │   ├── deck.ts
│       │   ├── permissions.ts
│       │   ├── room.ts
│       │   ├── stats.ts
│       │   └── types.ts
│       ├── services/
│       │   ├── cleanup-service.ts
│       │   ├── room-service.ts
│       │   ├── room-store.ts
│       │   ├── session-service.ts
│       │   └── timer-service.ts
│       ├── transport/
│       │   ├── serializers.ts
│       │   ├── socket-handlers.ts
│       │   └── validators.ts
│       └── utils/
│           ├── id.ts
│           ├── logger.ts
│           └── time.ts
├── shared/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── events.ts
│       ├── index.ts
│       └── types.ts
├── Dockerfile
├── package.json
├── tsconfig.base.json
├── .dockerignore
├── .gitignore
└── BUILD_SPEC.md
```

## Shared Package Boundary

The `shared` package should contain only:

- domain-facing TypeScript types shared by client and server
- event payload and ack types
- deck input types
- error code enums or unions

The `shared` package must not contain runtime room logic.

## Implementation Notes

### Room store

Owns:

- `Map<RoomId, Room>`

API:

```ts
get(roomId: RoomId): Room | undefined;
set(room: Room): void;
delete(roomId: RoomId): void;
list(): Room[];
```

### Room service

Owns all mutations:

- `createRoom`
- `joinRoom`
- `leaveRoom`
- `disconnectParticipant`
- `castVote`
- `clearVote`
- `revealVotes`
- `resetRound`
- `nextRound`
- `changeName`
- `changeRole`
- `changeDeck`
- `updateSettings`

This service should be the only layer allowed to mutate `Room`.

Behavior rules:

- `leaveRoom` removes the participant immediately, clears any vote they own, and reassigns moderator immediately if needed
- `disconnectParticipant` marks the participant disconnected, clears `socketId`, updates `lastSeenAt`, and leaves the participant record in place until cleanup
- if a leave or disconnect causes the room to have zero connected participants, reset `expiresAt` from that moment

### Timer service

Owns:

- schedule auto-reveal
- cancel auto-reveal
- cancel timers when room is deleted

### Cleanup service

Runs on interval and:

- removes stale disconnected participants
- reassigns moderator if needed
- deletes expired rooms that have no connected participants

### Session service

Helpers for:

- validating `sessionId`
- generating session IDs only when needed on the client, not the server
- resolving caller identity from socket-bound room context

## Client State Model

### Persistent browser storage

- `sessionId`
- `displayName`

### Volatile client state

- socket connection status
- current `room_state`
- pending mutation flags
- local selected card highlight
- modal visibility

The client should derive UI from the latest `room_state` snapshot rather than maintaining duplicate room state.

## Reconnect Behavior

### Expected flow

1. Browser refreshes or network reconnects.
2. Socket reconnects.
3. Client re-emits `join_room` with same `roomId`, `sessionId`, and last known `displayName`.
4. Server rebinds the existing participant if present.
5. Server sends `room_state`.

### Failure behavior

If room no longer exists:

- server returns `ROOM_NOT_FOUND` or `ROOM_EXPIRED`
- client should show a clear message and route back to `/`

If another tab has taken over the same participant identity:

- the older tab should treat itself as inactive for that room
- the server may report `SESSION_REPLACED`
- further room commands from the older tab must fail until it rejoins and becomes the latest socket again

## Minimal UI Requirements

### Landing page

- create room action
- name input
- role selector
- optional join existing room input

### Room page

- room ID and share link
- participant list with connected status and vote progress
- vote deck
- reveal/reset/next round controls
- deck selector
- revealed stats panel
- connection badge

### Moderator affordances

- moderator badge
- moderator-only controls disabled or hidden for others

## Error Handling

Client behavior:

- show server error messages as inline banner or toast
- do not assume a failed command changed room state
- continue rendering the last valid `room_state`
- if the client receives `SESSION_REPLACED`, it should disable room actions until the user explicitly rejoins

Server behavior:

- reject invalid commands with `AckFailure`
- do not partially mutate room state on validation failure

## Operational Requirements

### Logging

Structured logs are enough:

- server start
- room created
- room expired
- participant joined
- participant disconnected
- errors for invalid operations

Avoid verbose per-heartbeat logging.

### Health endpoint

`GET /api/health` should return:

```json
{ "ok": true }
```

## Test Plan

### Unit tests

- validators for names, deck input, votes
- stats calculation
- permission checks
- room service mutations
- serializer hidden-vs-revealed projection

### Integration tests

- create room and auto-join
- second participant joins by URL
- hidden votes do not leak values before reveal
- reveal exposes values and stats
- next round clears votes and increments round number
- refresh/reconnect with same `sessionId` preserves identity
- expired room is removed

### Manual verification

- two browser tabs with different local storage contexts
- one browser refresh in same tab preserves identity
- spectator cannot vote
- moderator-only controls reject non-moderators

## Implementation Phases

### Phase 1: Workspace bootstrap

- create root workspace with `client`, `server`, `shared`
- configure TypeScript project references or a simple workspace setup
- add Dockerfile and basic scripts

### Phase 2: Shared contracts

- add shared types
- add event payload types
- add error code types

Exit criteria:

- both client and server compile against the same contracts

### Phase 3: Server core

- Fastify app
- Socket.IO server bootstrap
- in-memory room store
- room service with create, join, leave, vote, reveal, reset, next round
- serializer and validators

Exit criteria:

- room lifecycle works end to end over sockets

### Phase 4: Client MVP UI

- landing page
- room page
- socket lifecycle hooks
- vote deck and participant grid
- moderator controls
- revealed stats

Exit criteria:

- full poker flow works in browser with two participants

### Phase 5: Expiry and reconnect hardening

- disconnected participant grace handling
- cleanup loop
- room expiry
- reconnect rebinding

Exit criteria:

- refresh and reconnect are stable within same browser session

### Phase 6: Packaging and polish

- Docker build
- production static serving
- health endpoint
- final manual QA checklist

## Acceptance Criteria

The MVP is complete when all of the following are true:

- one user can create a room and becomes moderator
- another user can join the room by URL without an account
- voters can cast hidden votes
- spectators can observe but cannot vote
- reveal exposes full votes and server-computed stats
- reset clears the round without incrementing the round number
- next round clears votes and increments the round number
- same browser session reconnects to the same participant when refreshing
- all room state disappears after process restart
- inactive rooms are automatically removed
- the app runs as a single container without any external state service

## Recommended First Build Cut

Build the following first:

- room creation
- room join by URL
- session-based participant rebinding
- hidden voting
- reveal
- reset
- next round
- deck selection
- stats on reveal
- room expiration

Leave these for later if needed:

- auto-reveal UI
- advanced settings screen
- moderator transfer
- QR code sharing
- richer animations
