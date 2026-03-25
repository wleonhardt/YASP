import { describe, it, expect, beforeEach } from "vitest";
import { RoomService } from "../services/room-service.js";
import { RoomStore } from "../services/room-store.js";

let store: RoomStore;
let service: RoomService;

beforeEach(() => {
  store = new RoomStore();
  service = new RoomService(store);
});

describe("RoomService.createRoom", () => {
  it("creates a room and assigns moderator", () => {
    const result = service.createRoom("session-1", "sock-1", "Alice", "voter");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { room, participantId } = result.data;
    expect(room.moderatorId).toBe(participantId);
    expect(room.participants.size).toBe(1);
    expect(room.roundNumber).toBe(1);
    expect(room.revealed).toBe(false);
    expect(store.get(room.id)).toBe(room);
  });

  it("rejects invalid name", () => {
    const result = service.createRoom("s1", "sock-1", "", "voter");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_NAME");
  });

  it("rejects invalid role", () => {
    const result = service.createRoom("s1", "sock-1", "Alice", "admin" as any);
    expect(result.ok).toBe(false);
  });

  it("uses custom deck if provided", () => {
    const result = service.createRoom("s1", "sock-1", "Alice", "voter", {
      type: "custom",
      label: "My Deck",
      cards: ["S", "M", "L"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.room.deck.type).toBe("custom");
    expect(result.data.room.deck.cards).toEqual(["S", "M", "L"]);
  });
});

describe("RoomService.joinRoom", () => {
  it("adds new participant", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;

    const join = service.joinRoom(roomId, "s2", "sock-2", "Bob", "voter");
    expect(join.ok).toBe(true);
    if (!join.ok) return;
    expect(join.data.room.participants.size).toBe(2);
    expect(join.data.replacedSocketId).toBeNull();
  });

  it("reconnects existing participant preserving vote", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;

    // Cast a vote
    service.castVote(roomId, "s1", "5");

    // Rejoin with new socket
    const join = service.joinRoom(roomId, "s1", "sock-2", "Alice Updated", "voter");
    expect(join.ok).toBe(true);
    if (!join.ok) return;

    expect(join.data.room.participants.size).toBe(1);
    expect(join.data.replacedSocketId).toBe("sock-1");
    // Vote preserved
    expect(join.data.room.votes.get("s1")).toBe("5");
    // Name updated
    expect(join.data.room.participants.get("s1")!.name).toBe("Alice Updated");
  });

  it("rejects join to non-existent room", () => {
    const result = service.joinRoom("NONEXIST", "s1", "sock-1", "Alice", "voter");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ROOM_NOT_FOUND");
  });

  it("assigns moderator if none exists", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const room = create.data.room;
    room.moderatorId = null;

    const join = service.joinRoom(room.id, "s2", "sock-2", "Bob", "voter");
    expect(join.ok).toBe(true);
    if (!join.ok) return;
    expect(join.data.room.moderatorId).toBe("s2");
  });

  it("rejects spectator when spectators disabled", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const room = create.data.room;
    room.settings.allowSpectators = false;

    const join = service.joinRoom(room.id, "s2", "sock-2", "Bob", "spectator");
    expect(join.ok).toBe(false);
    if (!join.ok) expect(join.error.code).toBe("SPECTATORS_DISABLED");
  });

  it("preserves existing name on reconnect when allowNameChange is false", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const room = create.data.room;
    room.settings.allowNameChange = false;

    // Reconnect with a different name
    const join = service.joinRoom(room.id, "s1", "sock-2", "New Name", "voter");
    expect(join.ok).toBe(true);
    if (!join.ok) return;
    // Name should still be "Alice" because allowNameChange is false
    expect(join.data.room.participants.get("s1")!.name).toBe("Alice");
  });

  it("updates name on reconnect when allowNameChange is true", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const room = create.data.room;
    room.settings.allowNameChange = true;

    const join = service.joinRoom(room.id, "s1", "sock-2", "New Name", "voter");
    expect(join.ok).toBe(true);
    if (!join.ok) return;
    expect(join.data.room.participants.get("s1")!.name).toBe("New Name");
  });
});

describe("RoomService.leaveRoom", () => {
  it("removes participant and their vote", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;

    service.joinRoom(roomId, "s2", "sock-2", "Bob", "voter");
    service.castVote(roomId, "s2", "3");

    const leave = service.leaveRoom(roomId, "s2");
    expect(leave.ok).toBe(true);
    if (!leave.ok) return;
    expect(leave.data.room.participants.has("s2")).toBe(false);
    expect(leave.data.room.votes.has("s2")).toBe(false);
  });

  it("reassigns moderator on leave", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;

    service.joinRoom(roomId, "s2", "sock-2", "Bob", "voter");

    const leave = service.leaveRoom(roomId, "s1");
    expect(leave.ok).toBe(true);
    if (!leave.ok) return;
    expect(leave.data.room.moderatorId).toBe("s2");
  });
});

describe("RoomService.disconnectParticipant", () => {
  it("marks participant disconnected but keeps record", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;

    const result = service.disconnectParticipant(roomId, "s1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const p = result.data.room.participants.get("s1");
    expect(p).toBeDefined();
    expect(p!.connected).toBe(false);
    expect(p!.socketId).toBeNull();
  });
});

describe("RoomService.castVote", () => {
  it("casts a valid vote", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;

    const result = service.castVote(roomId, "s1", "5");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.room.votes.get("s1")).toBe("5");
  });

  it("rejects vote not in deck", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const result = service.castVote(create.data.room.id, "s1", "999");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_VOTE");
  });

  it("rejects vote from spectator", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "spectator");
    if (!create.ok) return;
    const result = service.castVote(create.data.room.id, "s1", "5");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_ALLOWED");
  });

  it("rejects vote after reveal", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;
    service.castVote(roomId, "s1", "5");
    service.revealVotes(roomId, "s1");

    const result = service.castVote(roomId, "s1", "8");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ALREADY_REVEALED");
  });

  it("rejects vote from disconnected participant", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;
    service.disconnectParticipant(roomId, "s1");

    const result = service.castVote(roomId, "s1", "5");
    expect(result.ok).toBe(false);
  });
});

describe("RoomService.clearVote", () => {
  it("clears a vote", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;
    service.castVote(roomId, "s1", "5");

    const result = service.clearVote(roomId, "s1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.room.votes.has("s1")).toBe(false);
  });

  it("rejects clear after reveal", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;
    service.castVote(roomId, "s1", "5");
    service.revealVotes(roomId, "s1");

    const result = service.clearVote(roomId, "s1");
    expect(result.ok).toBe(false);
  });
});

describe("RoomService.revealVotes", () => {
  it("reveals votes", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;

    const result = service.revealVotes(roomId, "s1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.room.revealed).toBe(true);
  });

  it("rejects double reveal", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;
    service.revealVotes(roomId, "s1");

    const result = service.revealVotes(roomId, "s1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ALREADY_REVEALED");
  });

  it("rejects reveal from non-moderator when policy is moderator_only", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;
    service.joinRoom(roomId, "s2", "sock-2", "Bob", "voter");

    const result = service.revealVotes(roomId, "s2");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_ALLOWED");
  });
});

describe("RoomService.resetRound", () => {
  it("clears votes and sets revealed=false", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;
    service.castVote(roomId, "s1", "5");
    service.revealVotes(roomId, "s1");

    const result = service.resetRound(roomId, "s1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.room.votes.size).toBe(0);
    expect(result.data.room.revealed).toBe(false);
    expect(result.data.room.roundNumber).toBe(1);
  });
});

describe("RoomService.nextRound", () => {
  it("clears votes, sets revealed=false, increments roundNumber", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;
    service.castVote(roomId, "s1", "5");
    service.revealVotes(roomId, "s1");

    const result = service.nextRound(roomId, "s1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.room.votes.size).toBe(0);
    expect(result.data.room.revealed).toBe(false);
    expect(result.data.room.roundNumber).toBe(2);
  });
});

describe("RoomService.changeName", () => {
  it("changes participant name", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;

    const result = service.changeName(create.data.room.id, "s1", "  Alice B  ");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.room.participants.get("s1")!.name).toBe("Alice B");
  });

  it("rejects when name change disabled", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    create.data.room.settings.allowNameChange = false;

    const result = service.changeName(create.data.room.id, "s1", "New Name");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NAME_CHANGE_DISABLED");
  });
});

describe("RoomService.changeRole", () => {
  it("changes role and removes vote when switching to spectator", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;
    service.castVote(roomId, "s1", "5");

    const result = service.changeRole(roomId, "s1", "spectator");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.room.participants.get("s1")!.role).toBe("spectator");
    expect(result.data.room.votes.has("s1")).toBe(false);
  });
});

describe("RoomService.changeDeck", () => {
  it("changes deck and clears votes", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;
    service.castVote(roomId, "s1", "5");

    const result = service.changeDeck(roomId, "s1", { type: "tshirt" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.room.deck.type).toBe("tshirt");
    expect(result.data.room.votes.size).toBe(0);
    expect(result.data.room.revealed).toBe(false);
  });
});

describe("RoomService.updateSettings", () => {
  it("updates settings", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;

    const result = service.updateSettings(create.data.room.id, "s1", { autoReveal: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.room.settings.autoReveal).toBe(true);
  });

  it("rejects from non-moderator", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    service.joinRoom(create.data.room.id, "s2", "sock-2", "Bob", "voter");

    const result = service.updateSettings(create.data.room.id, "s2", { autoReveal: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_ALLOWED");
  });
});

describe("RoomService.allConnectedVotersVoted", () => {
  it("returns true when all connected voters voted", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const room = create.data.room;
    service.castVote(room.id, "s1", "5");

    expect(service.allConnectedVotersVoted(room)).toBe(true);
  });

  it("returns false when some voters haven't voted", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;
    service.joinRoom(roomId, "s2", "sock-2", "Bob", "voter");
    service.castVote(roomId, "s1", "5");

    const room = store.get(roomId)!;
    expect(service.allConnectedVotersVoted(room)).toBe(false);
  });

  it("ignores spectators", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;
    service.joinRoom(roomId, "s2", "sock-2", "Bob", "spectator");
    service.castVote(roomId, "s1", "5");

    const room = store.get(roomId)!;
    expect(service.allConnectedVotersVoted(room)).toBe(true);
  });
});
