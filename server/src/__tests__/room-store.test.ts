import { describe, expect, it } from "vitest";
import { DEFAULT_DECKS, DEFAULT_ROOM_SETTINGS } from "@yasp/shared";
import type { Participant, Room } from "../domain/types.js";
import { createRoomTimerState } from "../domain/timer.js";
import { InMemoryRoomStore } from "../services/room-store.js";

function makeParticipant(overrides: Partial<Participant> = {}): Participant {
  return {
    id: "p1",
    sessionId: "s1",
    name: "Alice",
    role: "voter",
    connected: true,
    socketId: "sock-1",
    joinedAt: 1000,
    lastSeenAt: 1000,
    ...overrides,
  };
}

function makeRoom(id: string, overrides: Partial<Room> = {}): Room {
  return {
    id,
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
    participants: new Map([["s1", makeParticipant()]]),
    votes: new Map(),
    sessionRounds: [],
    ...overrides,
  };
}

describe("InMemoryRoomStore", () => {
  it("supports save, get, list, and delete for active rooms", () => {
    const store = new InMemoryRoomStore();
    const roomA = makeRoom("ROOMA1");
    const roomB = makeRoom("ROOMB2", {
      participants: new Map([["s2", makeParticipant({ id: "p2", sessionId: "s2" })]]),
    });

    store.save(roomA);
    store.save(roomB);

    expect(store.get("ROOMA1")).toBe(roomA);
    expect(store.list().map((room) => room.id)).toEqual(["ROOMA1", "ROOMB2"]);

    store.delete("ROOMA1");

    expect(store.get("ROOMA1")).toBeUndefined();
    expect(store.list().map((room) => room.id)).toEqual(["ROOMB2"]);
  });

  it("overwrites the current active state for the same room id", () => {
    const store = new InMemoryRoomStore();
    const first = makeRoom("ROOMA1");
    const second = makeRoom("ROOMA1", { revealed: true, roundNumber: 2 });

    store.save(first);
    store.save(second);

    expect(store.get("ROOMA1")).toBe(second);
    expect(store.list()).toHaveLength(1);
    expect(store.get("ROOMA1")?.revealed).toBe(true);
    expect(store.get("ROOMA1")?.roundNumber).toBe(2);
  });
});
