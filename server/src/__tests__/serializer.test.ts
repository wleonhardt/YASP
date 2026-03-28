import { describe, it, expect } from "vitest";
import { serializeRoom } from "../transport/serializers.js";
import type { Room, Participant } from "../domain/types.js";
import { DEFAULT_ROOM_SETTINGS, DEFAULT_DECKS } from "@yasp/shared";

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
    revealed: false,
    roundNumber: 1,
    deck: DEFAULT_DECKS.fibonacci,
    settings: { ...DEFAULT_ROOM_SETTINGS },
    moderatorId: "p1",
    previousModeratorId: null,
    participants: new Map(),
    votes: new Map(),
    ...overrides,
  };
}

describe("serializeRoom", () => {
  it("marks isSelf correctly", () => {
    const p1 = makeParticipant({ id: "p1", sessionId: "s1" });
    const p2 = makeParticipant({ id: "p2", sessionId: "s2", name: "Bob", joinedAt: 2000 });
    const room = makeRoom({
      participants: new Map([["p1", p1], ["p2", p2]]),
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
      participants: new Map([["p1", p1]]),
      votes: new Map([["p1", "5"]]),
      revealed: false,
    });

    const state = serializeRoom(room, "s1");
    expect(state.votes).toBeNull();
    expect(state.stats).toBeNull();
    expect(state.participants[0].hasVoted).toBe(true);
  });

  it("exposes votes and stats after reveal", () => {
    const p1 = makeParticipant();
    const room = makeRoom({
      participants: new Map([["p1", p1]]),
      votes: new Map([["p1", "5"]]),
      revealed: true,
    });

    const state = serializeRoom(room, "s1");
    expect(state.votes).toEqual({ p1: "5" });
    expect(state.stats).not.toBeNull();
    expect(state.stats!.totalVotes).toBe(1);
  });

  it("does not leak socketId", () => {
    const p1 = makeParticipant({ socketId: "secret-socket" });
    const room = makeRoom({
      participants: new Map([["p1", p1]]),
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
      participants: new Map([["p1", p1], ["p2", p2], ["p3", p3]]),
    });

    const state = serializeRoom(room, "s1");
    expect(state.participants.map((p) => p.name)).toEqual(["Bob", "Alice", "Zara"]);
  });

  it("marks moderator correctly", () => {
    const p1 = makeParticipant({ id: "p1", sessionId: "s1" });
    const p2 = makeParticipant({ id: "p2", sessionId: "s2", name: "Bob", joinedAt: 2000 });
    const room = makeRoom({
      moderatorId: "p1",
      participants: new Map([["p1", p1], ["p2", p2]]),
    });

    const state = serializeRoom(room, "s2");
    expect(state.participants.find((p) => p.id === "p1")!.isModerator).toBe(true);
    expect(state.participants.find((p) => p.id === "p2")!.isModerator).toBe(false);
  });

  it("handles unknown self session", () => {
    const p1 = makeParticipant();
    const room = makeRoom({
      participants: new Map([["p1", p1]]),
    });

    const state = serializeRoom(room, "unknown-session");
    expect(state.me.participantId).toBeNull();
    expect(state.me.connected).toBe(false);
    expect(state.participants[0].isSelf).toBe(false);
  });
});
