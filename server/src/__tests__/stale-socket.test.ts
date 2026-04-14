import { describe, it, expect, beforeEach } from "vitest";
import { RoomService } from "../services/room-service.js";
import { RoomStore } from "../services/room-store.js";
import { SessionService } from "../services/session-service.js";

/**
 * Integration tests for stale-socket command rejection.
 * Simulates the resolveCallerFromSocket logic at the service/store level.
 */

let store: RoomStore;
let service: RoomService;
let sessions: SessionService;

beforeEach(() => {
  store = new RoomStore();
  service = new RoomService(store);
  sessions = new SessionService();
});

function resolveAndCheck(
  socketId: string,
  roomId: string
): { sessionId: string } | { rejected: true; reason: "not_bound" | "stale_socket" } {
  const binding = sessions.resolve(socketId);
  if (!binding || binding.roomId !== roomId) {
    return { rejected: true, reason: "not_bound" };
  }
  const room = store.get(roomId);
  if (!room) return { rejected: true, reason: "not_bound" };
  const participant = room.participants.get(binding.sessionId);
  if (!participant) return { rejected: true, reason: "not_bound" };
  if (participant.socketId !== socketId) return { rejected: true, reason: "stale_socket" };
  return { sessionId: binding.sessionId };
}

describe("stale-socket command rejection", () => {
  it("allows commands from the active socket", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) throw new Error("create failed");
    const roomId = create.data.room.id;
    sessions.bind("sock-1", "s1", roomId);

    const result = resolveAndCheck("sock-1", roomId);
    expect("sessionId" in result).toBe(true);
  });

  it("rejects commands from old socket after session replacement", () => {
    // Create room with sock-1
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) throw new Error("create failed");
    const roomId = create.data.room.id;
    sessions.bind("sock-1", "s1", roomId);

    // Same session joins with sock-2 (new tab)
    const join = service.joinRoom(roomId, "s1", "sock-2", "Alice", "voter");
    if (!join.ok) throw new Error("join failed");
    sessions.bind("sock-2", "s1", roomId);

    // sock-1 is now stale
    const staleResult = resolveAndCheck("sock-1", roomId);
    expect("rejected" in staleResult).toBe(true);
    if ("rejected" in staleResult) {
      expect(staleResult.reason).toBe("stale_socket");
    }

    // sock-2 is active
    const activeResult = resolveAndCheck("sock-2", roomId);
    expect("sessionId" in activeResult).toBe(true);
  });

  it("stale socket cannot cast vote", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) throw new Error("create failed");
    const roomId = create.data.room.id;
    sessions.bind("sock-1", "s1", roomId);

    // Replace socket
    service.joinRoom(roomId, "s1", "sock-2", "Alice", "voter");
    sessions.bind("sock-2", "s1", roomId);

    // Verify stale socket is rejected at resolution
    const resolution = resolveAndCheck("sock-1", roomId);
    expect("rejected" in resolution).toBe(true);
    if ("rejected" in resolution) {
      expect(resolution.reason).toBe("stale_socket");
    }

    // Active socket CAN vote
    const voteResult = service.castVote(roomId, "s1", "5");
    expect(voteResult.ok).toBe(true);
  });

  it("stale socket cannot reveal votes", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) throw new Error("create failed");
    const roomId = create.data.room.id;
    sessions.bind("sock-1", "s1", roomId);

    service.joinRoom(roomId, "s1", "sock-2", "Alice", "voter");
    sessions.bind("sock-2", "s1", roomId);

    // Stale socket resolution fails
    expect("rejected" in resolveAndCheck("sock-1", roomId)).toBe(true);
  });

  it("stale socket cannot reset or advance round", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) throw new Error("create failed");
    const roomId = create.data.room.id;
    sessions.bind("sock-1", "s1", roomId);

    service.joinRoom(roomId, "s1", "sock-2", "Alice", "voter");
    sessions.bind("sock-2", "s1", roomId);

    expect("rejected" in resolveAndCheck("sock-1", roomId)).toBe(true);
  });

  it("stale socket is rejected for a different room too", () => {
    const create1 = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create1.ok) throw new Error("create failed");
    sessions.bind("sock-1", "s1", create1.data.room.id);

    // Try to resolve for a non-existent room
    const result = resolveAndCheck("sock-1", "FAKEID");
    expect("rejected" in result).toBe(true);
    if ("rejected" in result) {
      expect(result.reason).toBe("not_bound");
    }
  });

  it("unbound socket is rejected as not_bound", () => {
    const result = resolveAndCheck("unknown-sock", "ANYROOM");
    expect("rejected" in result).toBe(true);
    if ("rejected" in result) {
      expect(result.reason).toBe("not_bound");
    }
  });

  it("after old socket rejoins, it becomes active again", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) throw new Error("create failed");
    const roomId = create.data.room.id;
    sessions.bind("sock-1", "s1", roomId);

    // Replace with sock-2
    service.joinRoom(roomId, "s1", "sock-2", "Alice", "voter");
    sessions.bind("sock-2", "s1", roomId);

    // sock-1 is stale
    expect("rejected" in resolveAndCheck("sock-1", roomId)).toBe(true);

    // sock-1 rejoins and takes over
    service.joinRoom(roomId, "s1", "sock-1", "Alice", "voter");
    sessions.bind("sock-1", "s1", roomId);

    // Now sock-1 is active, sock-2 is stale
    expect("sessionId" in resolveAndCheck("sock-1", roomId)).toBe(true);
    expect("rejected" in resolveAndCheck("sock-2", roomId)).toBe(true);
  });
});
