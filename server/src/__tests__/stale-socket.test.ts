import { describe, it, expect, beforeEach } from "vitest";
import {
  InMemoryActiveRoomSessionResolver,
  type ActiveRoomSessionResolver,
} from "../services/active-room-session-resolver.js";
import { RoomService } from "../services/room-service.js";
import { InMemoryRoomStore, type RoomStore } from "../services/room-store.js";
import { InMemorySessionBindingStore, type SessionBindingStore } from "../services/session-service.js";

let store: RoomStore;
let service: RoomService;
let sessions: SessionBindingStore;
let resolver: ActiveRoomSessionResolver;

beforeEach(() => {
  store = new InMemoryRoomStore();
  service = new RoomService(store);
  sessions = new InMemorySessionBindingStore();
  resolver = new InMemoryActiveRoomSessionResolver(sessions, store);
});

function expectActive(socketId: string, roomId: string, sessionId: string): void {
  expect(resolver.resolve(socketId, roomId)).toEqual({ ok: true, sessionId });
}

function expectRejected(socketId: string, roomId: string, code: string): void {
  const resolution = resolver.resolve(socketId, roomId);
  expect(resolution.ok).toBe(false);
  if (!resolution.ok) {
    expect(resolution.code).toBe(code);
  }
}

describe("stale-socket command rejection", () => {
  it("allows commands from the active socket", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) throw new Error("create failed");
    const roomId = create.data.room.id;
    sessions.bind("sock-1", "s1", roomId);

    expectActive("sock-1", roomId, "s1");
  });

  it("rejects commands from old socket after session replacement", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) throw new Error("create failed");
    const roomId = create.data.room.id;
    sessions.bind("sock-1", "s1", roomId);

    const join = service.joinRoom(roomId, "s1", "sock-2", "Alice", "voter");
    if (!join.ok) throw new Error("join failed");
    sessions.bind("sock-2", "s1", roomId);

    expectRejected("sock-1", roomId, "SESSION_REPLACED");
    expectActive("sock-2", roomId, "s1");
  });

  it("stale socket cannot cast vote", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) throw new Error("create failed");
    const roomId = create.data.room.id;
    sessions.bind("sock-1", "s1", roomId);

    service.joinRoom(roomId, "s1", "sock-2", "Alice", "voter");
    sessions.bind("sock-2", "s1", roomId);

    expectRejected("sock-1", roomId, "SESSION_REPLACED");

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

    expectRejected("sock-1", roomId, "SESSION_REPLACED");
  });

  it("stale socket cannot reset or advance round", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) throw new Error("create failed");
    const roomId = create.data.room.id;
    sessions.bind("sock-1", "s1", roomId);

    service.joinRoom(roomId, "s1", "sock-2", "Alice", "voter");
    sessions.bind("sock-2", "s1", roomId);

    expectRejected("sock-1", roomId, "SESSION_REPLACED");
  });

  it("rejects a socket bound to a different room", () => {
    const create1 = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create1.ok) throw new Error("create failed");
    sessions.bind("sock-1", "s1", create1.data.room.id);

    expectRejected("sock-1", "FAKEID", "PARTICIPANT_NOT_FOUND");
  });

  it("rejects an unbound socket", () => {
    expectRejected("unknown-sock", "ANYROOM", "PARTICIPANT_NOT_FOUND");
  });

  it("rejects a bound socket when the room is gone", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) throw new Error("create failed");
    const roomId = create.data.room.id;
    sessions.bind("sock-1", "s1", roomId);

    store.delete(roomId);

    expectRejected("sock-1", roomId, "ROOM_NOT_FOUND");
  });

  it("rejects a bound socket when its participant record is gone", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) throw new Error("create failed");
    const roomId = create.data.room.id;
    sessions.bind("sock-1", "s1", roomId);

    const room = store.get(roomId);
    if (!room) throw new Error("room missing");
    room.participants.delete("s1");
    store.save(room);

    expectRejected("sock-1", roomId, "PARTICIPANT_NOT_FOUND");
  });

  it("after old socket rejoins, it becomes active again", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) throw new Error("create failed");
    const roomId = create.data.room.id;
    sessions.bind("sock-1", "s1", roomId);

    service.joinRoom(roomId, "s1", "sock-2", "Alice", "voter");
    sessions.bind("sock-2", "s1", roomId);

    expectRejected("sock-1", roomId, "SESSION_REPLACED");

    service.joinRoom(roomId, "s1", "sock-1", "Alice", "voter");
    sessions.bind("sock-1", "s1", roomId);

    expectActive("sock-1", roomId, "s1");
    expectRejected("sock-2", roomId, "SESSION_REPLACED");
  });
});
