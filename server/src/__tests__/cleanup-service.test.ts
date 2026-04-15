import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicRoomState } from "@yasp/shared";
import { DISCONNECTED_PARTICIPANT_GRACE_MS } from "../config.js";
import { CleanupService } from "../services/cleanup-service.js";
import { RoomService } from "../services/room-service.js";
import { SocketRoomStatePublisher } from "../services/room-state-publisher.js";
import { InMemoryRoomStore, type RoomStore } from "../services/room-store.js";
import { InMemoryRoomTimerScheduler, type RoomTimerScheduler } from "../services/timer-service.js";

let store: RoomStore;
let roomService: RoomService;
let timerScheduler: RoomTimerScheduler;
let emit: ReturnType<typeof vi.fn>;
// Structural shape of the io.to(...) mock. Avoid vi.fn generics here:
// their signature differs between vitest v2 (<TArgs, TReturn>) and v3
// (<TFn>), so a plain callable type stays compatible with both majors.
let io: { to: (...args: unknown[]) => { emit: typeof emit } };
let cleanupService: CleanupService;

beforeEach(() => {
  store = new InMemoryRoomStore();
  roomService = new RoomService(store);
  timerScheduler = new InMemoryRoomTimerScheduler();
  emit = vi.fn();
  io = {
    to: vi.fn(() => ({ emit })),
  };
  const roomStatePublisher = new SocketRoomStatePublisher(io as never, store);
  cleanupService = new CleanupService(store, timerScheduler, roomStatePublisher);
});

afterEach(() => {
  timerScheduler.cancelAll();
  vi.restoreAllMocks();
});

describe("CleanupService", () => {
  it("removes stale disconnected participants keyed by sessionId and clears their public-id vote", () => {
    const create = roomService.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) throw new Error("create failed");

    const join = roomService.joinRoom(create.data.room.id, "s2", "sock-2", "Bob", "voter");
    if (!join.ok) throw new Error("join failed");

    const roomId = create.data.room.id;
    const bobParticipantId = join.data.participantId;

    const vote = roomService.castVote(roomId, "s2", "5");
    if (!vote.ok) throw new Error("vote failed");

    const disconnect = roomService.disconnectParticipant(roomId, "s2");
    if (!disconnect.ok) throw new Error("disconnect failed");

    const room = store.get(roomId);
    if (!room) throw new Error("room missing");

    const bob = room.participants.get("s2");
    if (!bob) throw new Error("bob missing");

    bob.lastSeenAt = Date.now() - DISCONNECTED_PARTICIPANT_GRACE_MS - 1;

    cleanupService.run();

    expect(room.participants.has("s2")).toBe(false);
    expect(room.votes.has(bobParticipantId)).toBe(false);

    expect(emit).toHaveBeenCalledWith("room_state", expect.any(Object));
    const state = emit.mock.calls[0]?.[1] as PublicRoomState;
    expect(state.participants.map((participant) => participant.id)).not.toContain("s2");
    expect(state.participants.every((participant) => !("sessionId" in participant))).toBe(true);
    expect(state.me.sessionId).toBe("s1");
  });

  it("clears previousModeratorId and preserves the replacement moderator when cleaning a stale previous moderator", () => {
    const create = roomService.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) throw new Error("create failed");

    const join = roomService.joinRoom(create.data.room.id, "s2", "sock-2", "Bob", "voter");
    if (!join.ok) throw new Error("join failed");

    const roomId = create.data.room.id;
    const aliceParticipantId = create.data.participantId;
    const bobParticipantId = join.data.participantId;

    const disconnect = roomService.disconnectParticipant(roomId, "s1");
    if (!disconnect.ok) throw new Error("disconnect failed");

    const room = store.get(roomId);
    if (!room) throw new Error("room missing");

    expect(room.moderatorId).toBe(bobParticipantId);
    expect(room.previousModeratorId).toBe(aliceParticipantId);

    const alice = room.participants.get("s1");
    if (!alice) throw new Error("alice missing");

    alice.lastSeenAt = Date.now() - DISCONNECTED_PARTICIPANT_GRACE_MS - 1;

    cleanupService.run();

    expect(room.participants.has("s1")).toBe(false);
    expect(room.moderatorId).toBe(bobParticipantId);
    expect(room.previousModeratorId).toBeNull();
  });
});
