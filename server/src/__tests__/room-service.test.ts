import { describe, it, expect, beforeEach } from "vitest";
import { RoomService } from "../services/room-service.js";
import { RoomStore } from "../services/room-store.js";
import { serializeRoom } from "../transport/serializers.js";

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
    const createRoom = service.createRoom as unknown as (
      sessionId: string,
      socketId: string,
      displayName: string,
      role: string
    ) => ReturnType<RoomService["createRoom"]>;
    const result = createRoom("s1", "sock-1", "Alice", "admin");
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

  it("auto-transfers moderator to next connected participant on disconnect", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;
    service.joinRoom(roomId, "s2", "sock-2", "Bob", "voter");
    service.joinRoom(roomId, "s3", "sock-3", "Carol", "voter");

    // Alice is moderator, disconnects
    const result = service.disconnectParticipant(roomId, "s1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Moderator should transfer to Bob (next by join order)
    expect(result.data.room.moderatorId).toBe("s2");
  });

  it("keeps moderator on disconnected participant if nobody else is connected", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;

    // Only participant disconnects — no one to hand off to
    const result = service.disconnectParticipant(roomId, "s1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Stays with Alice (she'll get it back on reconnect)
    expect(result.data.room.moderatorId).toBe("s1");
  });

  it("new moderator can reveal after auto-transfer", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;
    service.joinRoom(roomId, "s2", "sock-2", "Bob", "voter");
    service.castVote(roomId, "s2", "5");

    // Moderator disconnects
    service.disconnectParticipant(roomId, "s1");

    // Bob should now be able to reveal
    const reveal = service.revealVotes(roomId, "s2");
    expect(reveal.ok).toBe(true);
  });

  it("does not transfer moderator when a non-moderator disconnects", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;
    service.joinRoom(roomId, "s2", "sock-2", "Bob", "voter");

    // Bob (non-moderator) disconnects
    const result = service.disconnectParticipant(roomId, "s2");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Alice stays moderator
    expect(result.data.room.moderatorId).toBe("s1");
  });

  it("restores moderator on reconnect after auto-transfer", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;
    service.joinRoom(roomId, "s2", "sock-2", "Bob", "voter");

    // Alice disconnects → Bob becomes moderator
    service.disconnectParticipant(roomId, "s1");
    expect(store.get(roomId)!.moderatorId).toBe("s2");

    // Alice reconnects → gets moderator back
    const rejoin = service.joinRoom(roomId, "s1", "sock-1b", "Alice", "voter");
    expect(rejoin.ok).toBe(true);
    if (!rejoin.ok) return;
    expect(rejoin.data.room.moderatorId).toBe("s1");
    expect(rejoin.data.room.previousModeratorId).toBeNull();
  });

  it("does not restore moderator if manual transfer happened while away", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;
    service.joinRoom(roomId, "s2", "sock-2", "Bob", "voter");
    service.joinRoom(roomId, "s3", "sock-3", "Carol", "voter");

    // Alice disconnects → Bob becomes moderator
    service.disconnectParticipant(roomId, "s1");
    expect(store.get(roomId)!.moderatorId).toBe("s2");

    // Bob manually transfers to Carol (clears previousModeratorId)
    service.transferModerator(roomId, "s2", "s3");
    expect(store.get(roomId)!.moderatorId).toBe("s3");

    // Alice reconnects → does NOT get moderator back
    const rejoin = service.joinRoom(roomId, "s1", "sock-1b", "Alice", "voter");
    expect(rejoin.ok).toBe(true);
    if (!rejoin.ok) return;
    expect(rejoin.data.room.moderatorId).toBe("s3");
  });

  it("does not restore moderator if previous moderator left instead of reconnecting", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;
    service.joinRoom(roomId, "s2", "sock-2", "Bob", "voter");

    // Alice disconnects → Bob becomes moderator
    service.disconnectParticipant(roomId, "s1");

    // Alice leaves entirely
    service.leaveRoom(roomId, "s1");

    // Bob stays moderator, previousModeratorId is cleared
    const room = store.get(roomId)!;
    expect(room.moderatorId).toBe("s2");
    expect(room.previousModeratorId).toBeNull();
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

describe("RoomService.transferModerator", () => {
  it("allows the moderator to transfer host to another participant", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;
    service.joinRoom(roomId, "s2", "sock-2", "Bob", "voter");

    const result = service.transferModerator(roomId, "s1", "s2");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.room.moderatorId).toBe("s2");
  });

  it("reflects the new moderator in serialized room state", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;
    service.joinRoom(roomId, "s2", "sock-2", "Bob", "voter");

    const result = service.transferModerator(roomId, "s1", "s2");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const previousModeratorState = serializeRoom(result.data.room, "s1");
    const newModeratorState = serializeRoom(result.data.room, "s2");

    expect(
      previousModeratorState.participants.find((participant) => participant.id === "s1")?.isModerator
    ).toBe(false);
    expect(newModeratorState.participants.find((participant) => participant.id === "s2")?.isModerator).toBe(
      true
    );
  });

  it("rejects transfer from a non-moderator", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;
    service.joinRoom(roomId, "s2", "sock-2", "Bob", "voter");

    const result = service.transferModerator(roomId, "s2", "s1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_ALLOWED");
  });

  it("rejects transfer to self", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;

    const result = service.transferModerator(create.data.room.id, "s1", "s1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_ALLOWED");
  });

  it("rejects transfer to a missing participant", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;

    const result = service.transferModerator(create.data.room.id, "s1", "missing");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PARTICIPANT_NOT_FOUND");
  });

  it("allows transfer to a disconnected participant", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;
    service.joinRoom(roomId, "s2", "sock-2", "Bob", "voter");
    service.disconnectParticipant(roomId, "s2");

    const result = service.transferModerator(roomId, "s1", "s2");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.room.moderatorId).toBe("s2");
  });

  it("moves moderator-only permissions immediately", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;
    service.joinRoom(roomId, "s2", "sock-2", "Bob", "voter");

    const transfer = service.transferModerator(roomId, "s1", "s2");
    expect(transfer.ok).toBe(true);
    if (!transfer.ok) return;

    const previousModeratorReveal = service.revealVotes(roomId, "s1");
    expect(previousModeratorReveal.ok).toBe(false);
    if (!previousModeratorReveal.ok) {
      expect(previousModeratorReveal.error.code).toBe("NOT_ALLOWED");
    }

    const newModeratorReveal = service.revealVotes(roomId, "s2");
    expect(newModeratorReveal.ok).toBe(true);
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

describe("RoomService timer controls", () => {
  it("allows the moderator to start, pause, and reset the timer", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;

    const started = service.startTimer(roomId, "s1");
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.data.room.timer.running).toBe(true);
    expect(started.data.room.timer.endsAt).not.toBeNull();

    const paused = service.pauseTimer(roomId, "s1");
    expect(paused.ok).toBe(true);
    if (!paused.ok) return;
    expect(paused.data.room.timer.running).toBe(false);
    expect(paused.data.room.timer.endsAt).toBeNull();

    const reset = service.resetTimer(roomId, "s1");
    expect(reset.ok).toBe(true);
    if (!reset.ok) return;
    expect(reset.data.room.timer.remainingSeconds).toBe(reset.data.room.timer.durationSeconds);
    expect(reset.data.room.timer.completedAt).toBeNull();
  });

  it("rejects timer control actions from non-moderators", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;
    service.joinRoom(roomId, "s2", "sock-2", "Bob", "voter");

    const started = service.startTimer(roomId, "s2");
    expect(started.ok).toBe(false);
    if (!started.ok) {
      expect(started.error.code).toBe("NOT_ALLOWED");
    }
  });

  it("updates timer duration and serializes it in room state", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;

    const updated = service.setTimerDuration(roomId, "s1", 120);
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;

    const state = serializeRoom(updated.data.room, "s1");
    expect(state.timer.durationSeconds).toBe(120);
    expect(state.timer.remainingSeconds).toBe(120);
    expect(state.timer.running).toBe(false);
  });

  it("accepts the 10 second timer preset", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;

    const updated = service.setTimerDuration(roomId, "s1", 10);
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;

    expect(updated.data.room.timer.durationSeconds).toBe(10);
    expect(updated.data.room.timer.remainingSeconds).toBe(10);
  });

  it("marks timer completion correctly", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;

    service.startTimer(roomId, "s1");
    const completed = service.completeTimer(roomId);
    expect(completed.ok).toBe(true);
    if (!completed.ok) return;
    expect(completed.data.room.timer.running).toBe(false);
    expect(completed.data.room.timer.remainingSeconds).toBe(0);
    expect(completed.data.room.timer.completedAt).not.toBeNull();
    expect(completed.data.room.revealed).toBe(true);
  });

  it("rate-limits honk and keeps it moderator-only", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;
    service.joinRoom(roomId, "s2", "sock-2", "Bob", "voter");

    const first = service.honkTimer(roomId, "s1");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.room.timer.lastHonkAt).not.toBeNull();
    expect(first.data.room.timer.honkAvailableAt).not.toBeNull();

    const cooldown = service.honkTimer(roomId, "s1");
    expect(cooldown.ok).toBe(false);
    if (!cooldown.ok) {
      expect(cooldown.error.code).toBe("NOT_ALLOWED");
    }

    const nonModerator = service.honkTimer(roomId, "s2");
    expect(nonModerator.ok).toBe(false);
    if (!nonModerator.ok) {
      expect(nonModerator.error.code).toBe("NOT_ALLOWED");
    }
  });
});
