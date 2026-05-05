import { describe, it, expect, beforeEach } from "vitest";
import { RoomService } from "../services/room-service.js";
import { InMemoryRoomStore, type RoomStore } from "../services/room-store.js";
import { serializeRoom } from "../transport/serializers.js";

let store: RoomStore;
let service: RoomService;

beforeEach(() => {
  store = new InMemoryRoomStore();
  service = new RoomService(store);
});

function getParticipantId(roomId: string, sessionId: string): string {
  const participantId = store.get(roomId)?.participants.get(sessionId)?.id;
  if (!participantId) {
    throw new Error(`Participant for session ${sessionId} not found`);
  }

  return participantId;
}

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
    expect(room.participants.get("session-1")?.id).toBe(participantId);
    expect(participantId).not.toBe("session-1");
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
    expect(join.data.room.participants.get("s2")?.id).toBe(join.data.participantId);
    expect(join.data.participantId).not.toBe("s2");
  });

  it("reconnects existing participant preserving vote", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;
    const aliceParticipantId = create.data.participantId;

    // Cast a vote
    service.castVote(roomId, "s1", "5");

    // Rejoin with new socket
    const join = service.joinRoom(roomId, "s1", "sock-2", "Alice Updated", "voter");
    expect(join.ok).toBe(true);
    if (!join.ok) return;

    expect(join.data.room.participants.size).toBe(1);
    expect(join.data.replacedSocketId).toBe("sock-1");
    // Vote preserved
    expect(join.data.room.votes.get(aliceParticipantId)).toBe("5");
    // Name updated
    expect(join.data.room.participants.get("s1")!.name).toBe("Alice Updated");
    expect(join.data.participantId).toBe(aliceParticipantId);
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
    expect(join.data.room.moderatorId).toBe(join.data.participantId);
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
    const bobParticipantId = getParticipantId(roomId, "s2");

    const leave = service.leaveRoom(roomId, "s2");
    expect(leave.ok).toBe(true);
    if (!leave.ok) return;
    expect(leave.data.room.participants.has("s2")).toBe(false);
    expect(leave.data.room.votes.has(bobParticipantId)).toBe(false);
  });

  it("reassigns moderator on leave", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;

    const join = service.joinRoom(roomId, "s2", "sock-2", "Bob", "voter");
    if (!join.ok) return;

    const leave = service.leaveRoom(roomId, "s1");
    expect(leave.ok).toBe(true);
    if (!leave.ok) return;
    expect(leave.data.room.moderatorId).toBe(join.data.participantId);
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
    const bobJoin = service.joinRoom(roomId, "s2", "sock-2", "Bob", "voter");
    if (!bobJoin.ok) return;
    const carolJoin = service.joinRoom(roomId, "s3", "sock-3", "Carol", "voter");
    if (!carolJoin.ok) return;

    // Alice is moderator, disconnects
    const result = service.disconnectParticipant(roomId, "s1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Moderator should transfer to Bob (next by join order)
    expect(result.data.room.moderatorId).toBe(bobJoin.data.participantId);
  });

  it("keeps moderator on disconnected participant if nobody else is connected", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;
    const aliceParticipantId = create.data.participantId;

    // Only participant disconnects — no one to hand off to
    const result = service.disconnectParticipant(roomId, "s1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Stays with Alice (she'll get it back on reconnect)
    expect(result.data.room.moderatorId).toBe(aliceParticipantId);
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
    expect(result.data.room.moderatorId).toBe(create.data.participantId);
  });

  it("restores moderator on reconnect after auto-transfer", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;
    const bobJoin = service.joinRoom(roomId, "s2", "sock-2", "Bob", "voter");
    if (!bobJoin.ok) return;
    const aliceParticipantId = create.data.participantId;

    // Alice disconnects → Bob becomes moderator
    service.disconnectParticipant(roomId, "s1");
    expect(store.get(roomId)!.moderatorId).toBe(bobJoin.data.participantId);

    // Alice reconnects → gets moderator back
    const rejoin = service.joinRoom(roomId, "s1", "sock-1b", "Alice", "voter");
    expect(rejoin.ok).toBe(true);
    if (!rejoin.ok) return;
    expect(rejoin.data.room.moderatorId).toBe(aliceParticipantId);
    expect(rejoin.data.room.previousModeratorId).toBeNull();
    expect(rejoin.data.participantId).toBe(aliceParticipantId);
  });

  it("does not restore moderator if manual transfer happened while away", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;
    const bobJoin = service.joinRoom(roomId, "s2", "sock-2", "Bob", "voter");
    if (!bobJoin.ok) return;
    const carolJoin = service.joinRoom(roomId, "s3", "sock-3", "Carol", "voter");
    if (!carolJoin.ok) return;

    // Alice disconnects → Bob becomes moderator
    service.disconnectParticipant(roomId, "s1");
    expect(store.get(roomId)!.moderatorId).toBe(bobJoin.data.participantId);

    // Bob manually transfers to Carol (clears previousModeratorId)
    service.transferModerator(roomId, "s2", carolJoin.data.participantId);
    expect(store.get(roomId)!.moderatorId).toBe(carolJoin.data.participantId);

    // Alice reconnects → does NOT get moderator back
    const rejoin = service.joinRoom(roomId, "s1", "sock-1b", "Alice", "voter");
    expect(rejoin.ok).toBe(true);
    if (!rejoin.ok) return;
    expect(rejoin.data.room.moderatorId).toBe(carolJoin.data.participantId);
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
    expect(room.moderatorId).toBe(getParticipantId(roomId, "s2"));
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
    expect(result.data.room.votes.get(create.data.participantId)).toBe("5");
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
    expect(result.data.room.votes.has(create.data.participantId)).toBe(false);
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

describe("RoomService.reopenVoting", () => {
  it("returns a revealed round to voting while preserving hidden draft votes", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;
    const join = service.joinRoom(roomId, "s2", "sock-2", "Bob", "voter");
    if (!join.ok) return;
    service.castVote(roomId, "s1", "5");
    service.castVote(roomId, "s2", "8");
    service.revealVotes(roomId, "s1");

    const result = service.reopenVoting(roomId, "s1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.room.revealed).toBe(false);
    expect(result.data.room.roundNumber).toBe(1);
    expect(result.data.room.votes.get(create.data.participantId)).toBe("5");
    expect(result.data.room.votes.get(join.data.participantId)).toBe("8");
    expect(result.data.room.sessionRounds).toHaveLength(0);
  });

  it("replaces the reopened session snapshot when the round is revealed again", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;
    const join = service.joinRoom(roomId, "s2", "sock-2", "Bob", "voter");
    if (!join.ok) return;
    service.castVote(roomId, "s1", "5");
    service.castVote(roomId, "s2", "8");
    service.revealVotes(roomId, "s1");
    service.reopenVoting(roomId, "s1");
    service.castVote(roomId, "s2", "5");

    const reveal = service.revealVotes(roomId, "s1");

    expect(reveal.ok).toBe(true);
    if (!reveal.ok) return;
    expect(reveal.data.room.sessionRounds).toHaveLength(1);
    expect(reveal.data.room.sessionRounds[0].participants.map((participant) => participant.vote)).toEqual([
      "5",
      "5",
    ]);
  });

  it("rejects re-open before reveal and follows the reset policy", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;
    service.joinRoom(roomId, "s2", "sock-2", "Bob", "voter");

    const beforeReveal = service.reopenVoting(roomId, "s1");
    expect(beforeReveal.ok).toBe(false);
    if (!beforeReveal.ok) expect(beforeReveal.error.code).toBe("NOT_REVEALED");

    service.revealVotes(roomId, "s1");
    const blocked = service.reopenVoting(roomId, "s2");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.code).toBe("NOT_ALLOWED");
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
    const join = service.joinRoom(roomId, "s2", "sock-2", "Bob", "voter");
    if (!join.ok) return;

    const result = service.transferModerator(roomId, "s1", join.data.participantId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.room.moderatorId).toBe(join.data.participantId);
  });

  it("reflects the new moderator in serialized room state", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;
    const join = service.joinRoom(roomId, "s2", "sock-2", "Bob", "voter");
    if (!join.ok) return;

    const result = service.transferModerator(roomId, "s1", join.data.participantId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const previousModeratorState = serializeRoom(result.data.room, "s1");
    const newModeratorState = serializeRoom(result.data.room, "s2");

    expect(
      previousModeratorState.participants.find((participant) => participant.id === create.data.participantId)
        ?.isModerator
    ).toBe(false);
    expect(
      newModeratorState.participants.find((participant) => participant.id === join.data.participantId)
        ?.isModerator
    ).toBe(true);
  });

  it("rejects transfer from a non-moderator", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;
    const join = service.joinRoom(roomId, "s2", "sock-2", "Bob", "voter");
    if (!join.ok) return;

    const result = service.transferModerator(roomId, "s2", create.data.participantId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_ALLOWED");
  });

  it("rejects transfer to self", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;

    const result = service.transferModerator(create.data.room.id, "s1", create.data.participantId);
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
    const join = service.joinRoom(roomId, "s2", "sock-2", "Bob", "voter");
    if (!join.ok) return;
    service.disconnectParticipant(roomId, "s2");

    const result = service.transferModerator(roomId, "s1", join.data.participantId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.room.moderatorId).toBe(join.data.participantId);
  });

  it("moves moderator-only permissions immediately", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;
    const join = service.joinRoom(roomId, "s2", "sock-2", "Bob", "voter");
    if (!join.ok) return;

    const transfer = service.transferModerator(roomId, "s1", join.data.participantId);
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
    expect(result.data.room.votes.has(create.data.participantId)).toBe(false);
  });

  it("rejects switching to spectator when spectators are disabled", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    create.data.room.settings.allowSpectators = false;

    const result = service.changeRole(create.data.room.id, "s1", "spectator");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SPECTATORS_DISABLED");
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
  it("updates surfaced room settings without corrupting current room state", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;
    const spectatorJoin = service.joinRoom(roomId, "s2", "sock-2", "Bob", "spectator");
    if (!spectatorJoin.ok) return;
    service.castVote(roomId, "s1", "5");

    const result = service.updateSettings(roomId, "s1", {
      revealPolicy: "anyone",
      resetPolicy: "anyone",
      deckChangePolicy: "anyone",
      allowNameChange: false,
      allowSelfRoleSwitch: false,
      allowSpectators: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.room.settings.revealPolicy).toBe("anyone");
    expect(result.data.room.settings.resetPolicy).toBe("anyone");
    expect(result.data.room.settings.deckChangePolicy).toBe("anyone");
    expect(result.data.room.settings.allowNameChange).toBe(false);
    expect(result.data.room.settings.allowSelfRoleSwitch).toBe(false);
    expect(result.data.room.settings.allowSpectators).toBe(false);
    expect(result.data.room.participants.get("s2")?.role).toBe("spectator");
    expect(result.data.room.votes.get(create.data.participantId)).toBe("5");
    expect(result.data.room.revealed).toBe(false);
  });

  it("serializes the current settings for reconnecting and newly joined clients", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;

    const updated = service.updateSettings(roomId, "s1", {
      revealPolicy: "anyone",
      resetPolicy: "anyone",
      deckChangePolicy: "anyone",
      allowNameChange: false,
      allowSelfRoleSwitch: false,
      allowSpectators: false,
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;

    service.disconnectParticipant(roomId, "s1");
    const reconnect = service.joinRoom(roomId, "s1", "sock-2", "Alice", "voter");
    expect(reconnect.ok).toBe(true);
    if (!reconnect.ok) return;

    const reconnectedState = serializeRoom(reconnect.data.room, "s1");
    expect(reconnectedState.settings).toEqual({
      ...reconnect.data.room.settings,
    });

    const join = service.joinRoom(roomId, "s2", "sock-3", "Bob", "voter");
    expect(join.ok).toBe(true);
    if (!join.ok) return;

    const joinedState = serializeRoom(join.data.room, "s2");
    expect(joinedState.settings).toEqual({
      ...join.data.room.settings,
    });
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

  it("records a per-participant lastHonkAt on success (F-10 per-sender cooldown)", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;

    const before = store.get(roomId)?.participants.get("s1");
    expect(before?.lastHonkAt).toBeUndefined();

    const first = service.honkTimer(roomId, "s1");
    expect(first.ok).toBe(true);

    const after = store.get(roomId)?.participants.get("s1");
    expect(typeof after?.lastHonkAt).toBe("number");
  });

  it("per-participant cooldown rejects a re-honk even if room-level cooldown is cleared", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;

    const first = service.honkTimer(roomId, "s1");
    expect(first.ok).toBe(true);

    // Simulate the room-level gate having expired (e.g. if that window were
    // ever shortened or removed). The per-participant gate must still hold.
    const room = store.get(roomId)!;
    room.timer.honkAvailableAt = null;

    const second = service.honkTimer(roomId, "s1");
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe("NOT_ALLOWED");
  });

  it("one participant's cooldown does not block a different eligible honker", () => {
    // Alice creates the room, Bob joins. Alice honks, then transfers host to
    // Bob. Clear the room-level cooldown so only the per-participant gate is
    // in play. Bob (never honked) must be allowed to honk.
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) return;
    const roomId = create.data.room.id;

    const join = service.joinRoom(roomId, "s2", "sock-2", "Bob", "voter");
    expect(join.ok).toBe(true);
    if (!join.ok) return;
    const bobId = join.data.participantId;

    const aliceHonk = service.honkTimer(roomId, "s1");
    expect(aliceHonk.ok).toBe(true);

    const transfer = service.transferModerator(roomId, "s1", bobId);
    expect(transfer.ok).toBe(true);

    // Clear the room-level gate to isolate the per-participant logic.
    const room = store.get(roomId)!;
    room.timer.honkAvailableAt = null;

    const bobHonk = service.honkTimer(roomId, "s2");
    expect(bobHonk.ok).toBe(true);
    if (!bobHonk.ok) return;

    const bob = store.get(roomId)?.participants.get("s2");
    expect(typeof bob?.lastHonkAt).toBe("number");
  });
});

describe("RoomService.createRoom — resource caps", () => {
  it("rejects creation above the per-session moderator cap", () => {
    const sessionId = "session-spam";
    // MAX_ROOMS_MODERATED_PER_SESSION defaults to 5; create that many.
    for (let i = 0; i < 5; i++) {
      const res = service.createRoom(sessionId, `sock-${i}`, "Alice", "voter");
      expect(res.ok).toBe(true);
    }
    const overflow = service.createRoom(sessionId, "sock-overflow", "Alice", "voter");
    expect(overflow.ok).toBe(false);
    if (!overflow.ok) {
      expect(overflow.error.code).toBe("TOO_MANY_ROOMS");
    }
  });

  it("different sessions do not share the per-session moderator cap", () => {
    // Fill session A up to the cap.
    for (let i = 0; i < 5; i++) {
      const res = service.createRoom("session-A", `sock-A-${i}`, "Alice", "voter");
      expect(res.ok).toBe(true);
    }
    // Session B should still be able to create rooms.
    const res = service.createRoom("session-B", "sock-B", "Bob", "voter");
    expect(res.ok).toBe(true);
  });

  it("frees a slot when a session loses moderator status via transfer", () => {
    const sessionId = "session-transfer";
    for (let i = 0; i < 5; i++) {
      const res = service.createRoom(sessionId, `sock-${i}`, "Alice", "voter");
      expect(res.ok).toBe(true);
    }
    // Overflow attempt blocked.
    const blocked = service.createRoom(sessionId, "sock-blocked", "Alice", "voter");
    expect(blocked.ok).toBe(false);

    // Bring a second participant in and transfer moderator in one of the rooms.
    const rooms = store.list();
    const targetRoom = rooms[0];
    const join = service.joinRoom(targetRoom.id, "session-target", "sock-t", "Bob", "voter");
    if (!join.ok) throw new Error("join failed");
    const transfer = service.transferModerator(targetRoom.id, sessionId, join.data.participantId);
    expect(transfer.ok).toBe(true);

    // Now the spam session moderates only 4 rooms; a 6th create succeeds.
    const afterTransfer = service.createRoom(sessionId, "sock-after", "Alice", "voter");
    expect(afterTransfer.ok).toBe(true);
  });
});

describe("RoomService — hasBeenActive / empty-room short TTL", () => {
  it("starts false on newly-created rooms", () => {
    const create = service.createRoom("s-solo", "sock-solo", "Alice", "voter");
    if (!create.ok) throw new Error("create failed");
    expect(create.data.room.hasBeenActive).toBe(false);
  });

  it("is flipped true when a second participant joins", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) throw new Error("create failed");
    const join = service.joinRoom(create.data.room.id, "s2", "sock-2", "Bob", "voter");
    if (!join.ok) throw new Error("join failed");
    expect(store.get(create.data.room.id)?.hasBeenActive).toBe(true);
  });

  it("is flipped true when a vote is cast", () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) throw new Error("create failed");
    const vote = service.castVote(create.data.room.id, "s1", "3");
    expect(vote.ok).toBe(true);
    expect(store.get(create.data.room.id)?.hasBeenActive).toBe(true);
  });

  it("uses the shorter empty-room TTL when the last participant disconnects from a never-active room", async () => {
    const create = service.createRoom("s-abandon", "sock-abandon", "Alice", "voter");
    if (!create.ok) throw new Error("create failed");
    const roomId = create.data.room.id;

    const disconnect = service.disconnectParticipant(roomId, "s-abandon");
    expect(disconnect.ok).toBe(true);

    const room = store.get(roomId);
    if (!room) throw new Error("room gone too early");
    const { EMPTY_ROOM_TTL_MS, ROOM_TTL_MS } = await import("../config.js");
    // expiresAt is now + EMPTY_ROOM_TTL_MS — i.e. well below the full ROOM_TTL_MS.
    expect(room.expiresAt - Date.now()).toBeLessThanOrEqual(EMPTY_ROOM_TTL_MS + 50);
    expect(room.expiresAt - Date.now()).toBeLessThan(ROOM_TTL_MS);
  });

  it("keeps the full ROOM_TTL_MS on disconnect when the room has had real activity", async () => {
    const create = service.createRoom("s1", "sock-1", "Alice", "voter");
    if (!create.ok) throw new Error("create failed");
    const roomId = create.data.room.id;

    // Real activity: another participant joins.
    const join = service.joinRoom(roomId, "s2", "sock-2", "Bob", "voter");
    if (!join.ok) throw new Error("join failed");
    // Both leave.
    service.disconnectParticipant(roomId, "s1");
    const lastDisconnect = service.disconnectParticipant(roomId, "s2");
    expect(lastDisconnect.ok).toBe(true);

    const room = store.get(roomId);
    if (!room) throw new Error("room missing");
    const { ROOM_TTL_MS, EMPTY_ROOM_TTL_MS } = await import("../config.js");
    // Expires under ROOM_TTL_MS, not the empty-room TTL.
    const remaining = room.expiresAt - Date.now();
    expect(remaining).toBeGreaterThan(EMPTY_ROOM_TTL_MS);
    expect(remaining).toBeLessThanOrEqual(ROOM_TTL_MS + 50);
  });
});
