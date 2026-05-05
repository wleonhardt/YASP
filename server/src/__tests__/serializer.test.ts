import { describe, it, expect } from "vitest";
import { serializeRoom } from "../transport/serializers.js";
import type { Room, Participant } from "../domain/types.js";
import { DEFAULT_ROOM_SETTINGS, DEFAULT_DECKS } from "@yasp/shared";
import { createRoomTimerState } from "../domain/timer.js";

function makeParticipant(overrides: Partial<Participant> = {}): Participant {
  return {
    id: "p1",
    sessionId: "s1",
    name: "Alice",
    role: "voter",
    connected: true,
    socketId: "sock1",
    joinedAt: 1000,
    lastSeenAt: 1000,
    ...overrides,
  };
}

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: "TEST01",
    createdAt: 1000,
    lastActivityAt: 1000,
    expiresAt: 99999999,
    hasBeenActive: false,
    revealed: false,
    roundNumber: 1,
    currentStoryLabel: null,
    storyQueue: [],
    deck: DEFAULT_DECKS.fibonacci,
    settings: { ...DEFAULT_ROOM_SETTINGS },
    timer: createRoomTimerState(),
    moderatorId: "p1",
    previousModeratorId: null,
    participants: new Map(),
    votes: new Map(),
    sessionRounds: [],
    ...overrides,
  };
}

describe("serializeRoom", () => {
  it("marks isSelf correctly", () => {
    const p1 = makeParticipant({ id: "p1", sessionId: "s1" });
    const p2 = makeParticipant({ id: "p2", sessionId: "s2", name: "Bob", joinedAt: 2000 });
    const room = makeRoom({
      participants: new Map([
        ["s1", p1],
        ["s2", p2],
      ]),
    });

    const state = serializeRoom(room, "s1");
    expect(state.participants[0].isSelf).toBe(true);
    expect(state.participants[1].isSelf).toBe(false);
    expect(state.me.participantId).toBe("p1");
    expect(state.me.sessionId).toBe("s1");
  });

  it("hides votes before reveal", () => {
    const p1 = makeParticipant();
    const room = makeRoom({
      participants: new Map([["s1", p1]]),
      votes: new Map([["p1", "5"]]),
      revealed: false,
    });

    const state = serializeRoom(room, "s1");
    expect(state.votes).toBeNull();
    expect(state.stats).toBeNull();
    expect(state.participants[0].hasVoted).toBe(true);
    expect(state.me.ownVote).toBe("5");
  });

  it("only exposes the caller's own vote before reveal", () => {
    const p1 = makeParticipant({ id: "public-alice", sessionId: "private-alice" });
    const p2 = makeParticipant({ id: "public-bob", sessionId: "private-bob", name: "Bob", joinedAt: 2000 });
    const room = makeRoom({
      participants: new Map([
        ["private-alice", p1],
        ["private-bob", p2],
      ]),
      votes: new Map([
        ["public-alice", "5"],
        ["public-bob", "8"],
      ]),
      revealed: false,
    });

    const aliceState = serializeRoom(room, "private-alice");
    const bobState = serializeRoom(room, "private-bob");

    expect(aliceState.votes).toBeNull();
    expect(bobState.votes).toBeNull();
    expect(aliceState.me.ownVote).toBe("5");
    expect(bobState.me.ownVote).toBe("8");
  });

  it("exposes votes and stats after reveal", () => {
    const p1 = makeParticipant();
    const room = makeRoom({
      participants: new Map([["s1", p1]]),
      votes: new Map([["p1", "5"]]),
      revealed: true,
    });

    const state = serializeRoom(room, "s1");
    expect(state.votes).toEqual({ p1: "5" });
    expect(state.stats).not.toBeNull();
    expect(state.stats!.totalVotes).toBe(1);
  });

  it("serializes current story and upcoming agenda", () => {
    const p1 = makeParticipant();
    const room = makeRoom({
      participants: new Map([["s1", p1]]),
      currentStoryLabel: "Checkout total",
      storyQueue: [
        { id: "story-1", label: "Discount code" },
        { id: "story-2", label: "Guest checkout" },
      ],
    });

    const state = serializeRoom(room, "s1");

    expect(state.currentStoryLabel).toBe("Checkout total");
    expect(state.storyQueue).toEqual([
      { id: "story-1", label: "Discount code" },
      { id: "story-2", label: "Guest checkout" },
    ]);
  });

  it("serializes timer state with remaining seconds", () => {
    const p1 = makeParticipant();
    const room = makeRoom({
      participants: new Map([["s1", p1]]),
      timer: {
        ...createRoomTimerState(),
        durationSeconds: 60,
        remainingSeconds: 60,
        running: true,
        endsAt: Date.now() + 45_000,
      },
    });

    const state = serializeRoom(room, "s1");
    expect(state.timer.durationSeconds).toBe(60);
    expect(state.timer.running).toBe(true);
    expect(state.timer.remainingSeconds).toBeGreaterThan(0);
    expect(state.timer.remainingSeconds).toBeLessThanOrEqual(45);
  });

  it("does not leak socketId", () => {
    const p1 = makeParticipant({ socketId: "secret-socket" });
    const room = makeRoom({
      participants: new Map([["s1", p1]]),
    });

    const state = serializeRoom(room, "s1");
    const participant = state.participants[0];
    expect("socketId" in participant).toBe(false);
  });

  it("sorts participants by joinedAt then name", () => {
    const p1 = makeParticipant({ id: "p1", sessionId: "s1", name: "Zara", joinedAt: 1000 });
    const p2 = makeParticipant({ id: "p2", sessionId: "s2", name: "Alice", joinedAt: 1000 });
    const p3 = makeParticipant({ id: "p3", sessionId: "s3", name: "Bob", joinedAt: 500 });
    const room = makeRoom({
      participants: new Map([
        ["s1", p1],
        ["s2", p2],
        ["s3", p3],
      ]),
    });

    const state = serializeRoom(room, "s1");
    expect(state.participants.map((p) => p.name)).toEqual(["Bob", "Alice", "Zara"]);
  });

  it("marks moderator correctly", () => {
    const p1 = makeParticipant({ id: "p1", sessionId: "s1" });
    const p2 = makeParticipant({ id: "p2", sessionId: "s2", name: "Bob", joinedAt: 2000 });
    const room = makeRoom({
      moderatorId: "p1",
      participants: new Map([
        ["s1", p1],
        ["s2", p2],
      ]),
    });

    const state = serializeRoom(room, "s2");
    expect(state.participants.find((p) => p.id === "p1")!.isModerator).toBe(true);
    expect(state.participants.find((p) => p.id === "p2")!.isModerator).toBe(false);
  });

  it("handles unknown self session", () => {
    const p1 = makeParticipant();
    const room = makeRoom({
      participants: new Map([["s1", p1]]),
    });

    const state = serializeRoom(room, "unknown-session");
    expect(state.me.participantId).toBeNull();
    expect(state.me.connected).toBe(false);
    expect(state.participants[0].isSelf).toBe(false);
  });

  it("serializes public participant ids instead of session ids", () => {
    const p1 = makeParticipant({ id: "public-alice", sessionId: "private-alice" });
    const p2 = makeParticipant({ id: "public-bob", sessionId: "private-bob", name: "Bob", joinedAt: 2000 });
    const room = makeRoom({
      participants: new Map([
        ["private-alice", p1],
        ["private-bob", p2],
      ]),
      votes: new Map([
        ["public-alice", "5"],
        ["public-bob", "8"],
      ]),
      revealed: true,
    });

    const state = serializeRoom(room, "private-alice");

    expect(state.participants.map((participant) => participant.id)).toEqual(["public-alice", "public-bob"]);
    expect(state.participants.map((participant) => participant.id)).not.toContain("private-bob");
    expect(state.votes).toEqual({
      "public-alice": "5",
      "public-bob": "8",
    });
    expect(state.me.participantId).toBe("public-alice");
    expect(state.me.sessionId).toBe("private-alice");
    expect(state.participants.every((participant) => !("sessionId" in participant))).toBe(true);
  });

  it("only includes the caller's private sessionId in me", () => {
    const p1 = makeParticipant({ id: "public-alice", sessionId: "private-alice" });
    const p2 = makeParticipant({ id: "public-bob", sessionId: "private-bob", name: "Bob", joinedAt: 2000 });
    const room = makeRoom({
      participants: new Map([
        ["private-alice", p1],
        ["private-bob", p2],
      ]),
    });

    const aliceState = serializeRoom(room, "private-alice");
    const bobState = serializeRoom(room, "private-bob");

    expect(aliceState.me.sessionId).toBe("private-alice");
    expect(bobState.me.sessionId).toBe("private-bob");
    expect(aliceState.participants.every((participant) => participant.id !== "private-bob")).toBe(true);
    expect(bobState.participants.every((participant) => participant.id !== "private-alice")).toBe(true);
  });
});
