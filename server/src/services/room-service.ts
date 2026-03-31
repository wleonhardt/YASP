import {
  DEFAULT_ROOM_SETTINGS,
  ROOM_TIMER_HONK_COOLDOWN_MS,
  ROOM_TIMER_PRESET_SECONDS,
  type AckResult,
  type DeckInput,
  type ParticipantRole,
  type RoomId,
  type RoomSettings,
  type ServerErrorEvent,
  type SessionId,
  type SocketId,
  type VoteValue,
} from "@yasp/shared";
import type { Room, Participant } from "../domain/types.js";
import { RoomStore } from "./room-store.js";
import { resolveDeck } from "../domain/deck.js";
import { reassignModeratorIfNeeded, findNextModerator, hasConnectedParticipants } from "../domain/room.js";
import { createRoomTimerState, getRemainingSeconds } from "../domain/timer.js";
import * as permissions from "../domain/permissions.js";
import { generateRoomId } from "../utils/id.js";
import { now } from "../utils/time.js";
import { ROOM_TTL_MS } from "../config.js";
import { logger } from "../utils/logger.js";
import {
  validateName,
  sanitizeName,
  validateRole,
  validateDeckInput,
  normalizeDeckInput,
  validateVote,
  validateSettingsUpdate,
} from "../transport/validators.js";

function fail(error: ServerErrorEvent): AckResult<never> {
  return { ok: false, error };
}

function success<T>(data: T): AckResult<T> {
  return { ok: true, data };
}

function touchRoom(room: Room): void {
  const t = now();
  room.lastActivityAt = t;
  room.expiresAt = t + ROOM_TTL_MS;
}

const ROOM_TIMER_PRESETS = Array.isArray(ROOM_TIMER_PRESET_SECONDS)
  ? ROOM_TIMER_PRESET_SECONDS
  : ([30, 60, 120, 300] as const);

export class RoomService {
  constructor(private store: RoomStore) {}

  createRoom(
    sessionId: SessionId,
    socketId: SocketId,
    displayName: string,
    requestedRole: ParticipantRole,
    deckInput?: DeckInput
  ): AckResult<{ room: Room; participantId: string }> {
    const nameCheck = validateName(displayName);
    if (!nameCheck.valid) return fail(nameCheck.error);

    const roleCheck = validateRole(requestedRole);
    if (!roleCheck.valid) return fail(roleCheck.error);

    if (deckInput) {
      const deckCheck = validateDeckInput(deckInput);
      if (!deckCheck.valid) return fail(deckCheck.error);
      deckInput = normalizeDeckInput(deckInput);
    }

    const roomId = this.generateUniqueRoomId();
    const t = now();
    const participantId = sessionId; // v1: participantId === sessionId

    const participant: Participant = {
      id: participantId,
      sessionId,
      name: sanitizeName(displayName),
      role: requestedRole,
      connected: true,
      socketId,
      joinedAt: t,
      lastSeenAt: t,
    };

    const room: Room = {
      id: roomId,
      createdAt: t,
      lastActivityAt: t,
      expiresAt: t + ROOM_TTL_MS,
      revealed: false,
      roundNumber: 1,
      deck: resolveDeck(deckInput),
      settings: { ...DEFAULT_ROOM_SETTINGS },
      timer: createRoomTimerState(),
      moderatorId: participantId,
      previousModeratorId: null,
      participants: new Map([[participantId, participant]]),
      votes: new Map(),
    };

    this.store.set(room);
    logger.info("Room created", { roomId, moderator: participantId });
    return success({ room, participantId });
  }

  joinRoom(
    roomId: RoomId,
    sessionId: SessionId,
    socketId: SocketId,
    displayName: string,
    requestedRole: ParticipantRole
  ): AckResult<{ room: Room; participantId: string; replacedSocketId: SocketId | null }> {
    const room = this.store.get(roomId);
    if (!room) return fail({ code: "ROOM_NOT_FOUND", message: "Room not found" });

    const nameCheck = validateName(displayName);
    if (!nameCheck.valid) return fail(nameCheck.error);

    const roleCheck = validateRole(requestedRole);
    if (!roleCheck.valid) return fail(roleCheck.error);

    if (requestedRole === "spectator" && !room.settings.allowSpectators) {
      return fail({ code: "SPECTATORS_DISABLED", message: "Spectators are not allowed in this room" });
    }

    const participantId = sessionId;
    const existing = room.participants.get(participantId);
    let replacedSocketId: SocketId | null = null;

    if (existing) {
      // Reconnect / tab takeover
      replacedSocketId = existing.socketId;
      existing.socketId = socketId;
      existing.connected = true;
      existing.lastSeenAt = now();
      // Only update name on reconnect if name changes are allowed
      if (room.settings.allowNameChange) {
        existing.name = sanitizeName(displayName);
      }
      // Restore moderator status if this participant was auto-demoted on disconnect
      if (room.previousModeratorId === participantId) {
        room.moderatorId = participantId;
        room.previousModeratorId = null;
        logger.info("Moderator restored on reconnect", { roomId, participantId });
      }
      // Preserve prior vote for current round
    } else {
      // New participant
      const participant: Participant = {
        id: participantId,
        sessionId,
        name: sanitizeName(displayName),
        role: requestedRole,
        connected: true,
        socketId,
        joinedAt: now(),
        lastSeenAt: now(),
      };
      room.participants.set(participantId, participant);
    }

    // Assign moderator if none
    if (!room.moderatorId) {
      room.moderatorId = participantId;
    }

    touchRoom(room);
    logger.info("Participant joined", { roomId, participantId });
    return success({ room, participantId, replacedSocketId });
  }

  leaveRoom(roomId: RoomId, participantId: string): AckResult<{ room: Room }> {
    const room = this.store.get(roomId);
    if (!room) return fail({ code: "ROOM_NOT_FOUND", message: "Room not found" });

    const participant = room.participants.get(participantId);
    if (!participant) return fail({ code: "PARTICIPANT_NOT_FOUND", message: "Participant not found" });

    // Remove participant and their vote
    room.participants.delete(participantId);
    room.votes.delete(participantId);

    // Clear auto-restore if the previous moderator is leaving
    if (room.previousModeratorId === participantId) {
      room.previousModeratorId = null;
    }

    // Reassign moderator if needed
    if (room.moderatorId === participantId) {
      room.moderatorId = null;
      reassignModeratorIfNeeded(room);
    }

    // If no connected participants, reset expiry
    if (!hasConnectedParticipants(room)) {
      room.expiresAt = now() + ROOM_TTL_MS;
    }

    touchRoom(room);
    return success({ room });
  }

  disconnectParticipant(roomId: RoomId, participantId: string): AckResult<{ room: Room }> {
    const room = this.store.get(roomId);
    if (!room) return fail({ code: "ROOM_NOT_FOUND", message: "Room not found" });

    const participant = room.participants.get(participantId);
    if (!participant) return fail({ code: "PARTICIPANT_NOT_FOUND", message: "Participant not found" });

    participant.connected = false;
    participant.socketId = null;
    participant.lastSeenAt = now();

    // If the moderator disconnected, hand off to the next connected participant
    // so the room isn't stuck without anyone who can reveal/reset.
    // Track the previous moderator so we can restore them on reconnect.
    if (room.moderatorId === participantId && hasConnectedParticipants(room)) {
      const next = findNextModerator(room, participantId);
      if (next && next.connected) {
        room.previousModeratorId = participantId;
        room.moderatorId = next.id;
        logger.info("Moderator disconnected, auto-transferred", {
          roomId,
          from: participantId,
          to: next.id,
        });
      }
    }

    // If no connected participants remain, reset expiry
    if (!hasConnectedParticipants(room)) {
      room.expiresAt = now() + ROOM_TTL_MS;
    }

    logger.info("Participant disconnected", { roomId, participantId });
    return success({ room });
  }

  castVote(roomId: RoomId, participantId: string, value: VoteValue): AckResult<{ room: Room }> {
    const room = this.store.get(roomId);
    if (!room) return fail({ code: "ROOM_NOT_FOUND", message: "Room not found" });

    const participant = room.participants.get(participantId);
    if (!participant) return fail({ code: "PARTICIPANT_NOT_FOUND", message: "Participant not found" });
    if (!participant.connected) return fail({ code: "NOT_ALLOWED", message: "Participant is not connected" });
    if (participant.role !== "voter") return fail({ code: "NOT_ALLOWED", message: "Spectators cannot vote" });
    if (room.revealed) return fail({ code: "ALREADY_REVEALED", message: "Votes have already been revealed" });

    const voteCheck = validateVote(value, room.deck.cards);
    if (!voteCheck.valid) return fail(voteCheck.error);

    room.votes.set(participantId, value);
    touchRoom(room);
    return success({ room });
  }

  clearVote(roomId: RoomId, participantId: string): AckResult<{ room: Room }> {
    const room = this.store.get(roomId);
    if (!room) return fail({ code: "ROOM_NOT_FOUND", message: "Room not found" });

    const participant = room.participants.get(participantId);
    if (!participant) return fail({ code: "PARTICIPANT_NOT_FOUND", message: "Participant not found" });
    if (room.revealed) return fail({ code: "ALREADY_REVEALED", message: "Cannot clear vote after reveal" });

    room.votes.delete(participantId);
    touchRoom(room);
    return success({ room });
  }

  revealVotes(roomId: RoomId, participantId: string): AckResult<{ room: Room }> {
    const room = this.store.get(roomId);
    if (!room) return fail({ code: "ROOM_NOT_FOUND", message: "Room not found" });
    if (room.revealed) return fail({ code: "ALREADY_REVEALED", message: "Already revealed" });
    if (!permissions.canReveal(room, participantId)) {
      return fail({ code: "NOT_ALLOWED", message: "Not allowed to reveal votes" });
    }

    room.revealed = true;
    touchRoom(room);
    return success({ room });
  }

  resetRound(roomId: RoomId, participantId: string): AckResult<{ room: Room }> {
    const room = this.store.get(roomId);
    if (!room) return fail({ code: "ROOM_NOT_FOUND", message: "Room not found" });
    if (!permissions.canReset(room, participantId)) {
      return fail({ code: "NOT_ALLOWED", message: "Not allowed to reset round" });
    }

    room.votes.clear();
    room.revealed = false;
    touchRoom(room);
    return success({ room });
  }

  nextRound(roomId: RoomId, participantId: string): AckResult<{ room: Room }> {
    const room = this.store.get(roomId);
    if (!room) return fail({ code: "ROOM_NOT_FOUND", message: "Room not found" });
    if (!permissions.canNextRound(room, participantId)) {
      return fail({ code: "NOT_ALLOWED", message: "Not allowed to advance round" });
    }

    room.votes.clear();
    room.revealed = false;
    room.roundNumber += 1;
    touchRoom(room);
    return success({ room });
  }

  transferModerator(
    roomId: RoomId,
    participantId: string,
    targetParticipantId: string
  ): AckResult<{ room: Room }> {
    const room = this.store.get(roomId);
    if (!room) return fail({ code: "ROOM_NOT_FOUND", message: "Room not found" });

    const participant = room.participants.get(participantId);
    if (!participant) return fail({ code: "PARTICIPANT_NOT_FOUND", message: "Participant not found" });
    if (!permissions.canTransferModerator(room, participantId)) {
      return fail({ code: "NOT_ALLOWED", message: "Only the moderator can transfer host" });
    }
    if (participantId === targetParticipantId) {
      return fail({ code: "NOT_ALLOWED", message: "Choose another participant to transfer host" });
    }

    const targetParticipant = room.participants.get(targetParticipantId);
    if (!targetParticipant) {
      return fail({ code: "PARTICIPANT_NOT_FOUND", message: "Participant not found" });
    }

    room.moderatorId = targetParticipantId;
    room.previousModeratorId = null; // Manual transfer clears auto-restore
    touchRoom(room);
    return success({ room });
  }

  setTimerDuration(
    roomId: RoomId,
    participantId: string,
    durationSeconds: number
  ): AckResult<{ room: Room }> {
    const room = this.store.get(roomId);
    if (!room) return fail({ code: "ROOM_NOT_FOUND", message: "Room not found" });
    if (!permissions.isModerator(room, participantId)) {
      return fail({ code: "NOT_ALLOWED", message: "Only the moderator can change the timer" });
    }
    if (!ROOM_TIMER_PRESETS.includes(durationSeconds as (typeof ROOM_TIMER_PRESETS)[number])) {
      return fail({ code: "NOT_ALLOWED", message: "Timer duration is not allowed" });
    }
    if (room.timer.running) {
      return fail({ code: "NOT_ALLOWED", message: "Pause the timer before changing duration" });
    }

    room.timer.durationSeconds = durationSeconds;
    room.timer.remainingSeconds = durationSeconds;
    room.timer.completedAt = null;
    room.timer.endsAt = null;
    touchRoom(room);
    return success({ room });
  }

  startTimer(roomId: RoomId, participantId: string): AckResult<{ room: Room }> {
    const room = this.store.get(roomId);
    if (!room) return fail({ code: "ROOM_NOT_FOUND", message: "Room not found" });
    if (!permissions.isModerator(room, participantId)) {
      return fail({ code: "NOT_ALLOWED", message: "Only the moderator can start the timer" });
    }

    const remainingSeconds =
      room.timer.remainingSeconds > 0 ? room.timer.remainingSeconds : room.timer.durationSeconds;
    room.timer.running = true;
    room.timer.remainingSeconds = remainingSeconds;
    room.timer.endsAt = now() + remainingSeconds * 1000;
    room.timer.completedAt = null;
    touchRoom(room);
    return success({ room });
  }

  pauseTimer(roomId: RoomId, participantId: string): AckResult<{ room: Room }> {
    const room = this.store.get(roomId);
    if (!room) return fail({ code: "ROOM_NOT_FOUND", message: "Room not found" });
    if (!permissions.isModerator(room, participantId)) {
      return fail({ code: "NOT_ALLOWED", message: "Only the moderator can pause the timer" });
    }

    room.timer.remainingSeconds = getRemainingSeconds(room.timer, now());
    room.timer.running = false;
    room.timer.endsAt = null;
    touchRoom(room);
    return success({ room });
  }

  resetTimer(roomId: RoomId, participantId: string): AckResult<{ room: Room }> {
    const room = this.store.get(roomId);
    if (!room) return fail({ code: "ROOM_NOT_FOUND", message: "Room not found" });
    if (!permissions.isModerator(room, participantId)) {
      return fail({ code: "NOT_ALLOWED", message: "Only the moderator can reset the timer" });
    }

    room.timer.running = false;
    room.timer.endsAt = null;
    room.timer.remainingSeconds = room.timer.durationSeconds;
    room.timer.completedAt = null;
    touchRoom(room);
    return success({ room });
  }

  completeTimer(roomId: RoomId): AckResult<{ room: Room }> {
    const room = this.store.get(roomId);
    if (!room) return fail({ code: "ROOM_NOT_FOUND", message: "Room not found" });

    room.timer.running = false;
    room.timer.endsAt = null;
    room.timer.remainingSeconds = 0;
    room.timer.completedAt = now();
    room.revealed = true;
    touchRoom(room);
    return success({ room });
  }

  honkTimer(roomId: RoomId, participantId: string): AckResult<{ room: Room }> {
    const room = this.store.get(roomId);
    if (!room) return fail({ code: "ROOM_NOT_FOUND", message: "Room not found" });
    if (!permissions.isModerator(room, participantId)) {
      return fail({ code: "NOT_ALLOWED", message: "Only the moderator can honk the timer" });
    }

    const t = now();
    if (room.timer.honkAvailableAt !== null && t < room.timer.honkAvailableAt) {
      return fail({ code: "NOT_ALLOWED", message: "Please wait before sending another reminder" });
    }

    room.timer.lastHonkAt = t;
    room.timer.honkAvailableAt = t + ROOM_TIMER_HONK_COOLDOWN_MS;
    touchRoom(room);
    return success({ room });
  }

  changeName(roomId: RoomId, participantId: string, name: string): AckResult<{ room: Room }> {
    const room = this.store.get(roomId);
    if (!room) return fail({ code: "ROOM_NOT_FOUND", message: "Room not found" });
    if (!permissions.canChangeName(room)) {
      return fail({ code: "NAME_CHANGE_DISABLED", message: "Name changes are disabled" });
    }

    const nameCheck = validateName(name);
    if (!nameCheck.valid) return fail(nameCheck.error);

    const participant = room.participants.get(participantId);
    if (!participant) return fail({ code: "PARTICIPANT_NOT_FOUND", message: "Participant not found" });

    participant.name = sanitizeName(name);
    touchRoom(room);
    return success({ room });
  }

  changeRole(roomId: RoomId, participantId: string, role: ParticipantRole): AckResult<{ room: Room }> {
    const room = this.store.get(roomId);
    if (!room) return fail({ code: "ROOM_NOT_FOUND", message: "Room not found" });
    if (!permissions.canChangeRole(room)) {
      return fail({ code: "ROLE_CHANGE_DISABLED", message: "Role changes are disabled" });
    }

    const roleCheck = validateRole(role);
    if (!roleCheck.valid) return fail(roleCheck.error);

    if (role === "spectator" && !permissions.canBeSpectator(room)) {
      return fail({ code: "SPECTATORS_DISABLED", message: "Spectators are not allowed" });
    }

    const participant = room.participants.get(participantId);
    if (!participant) return fail({ code: "PARTICIPANT_NOT_FOUND", message: "Participant not found" });

    participant.role = role;

    // If switching to spectator, remove their vote
    if (role === "spectator") {
      room.votes.delete(participantId);
    }

    touchRoom(room);
    return success({ room });
  }

  changeDeck(roomId: RoomId, participantId: string, deckInput: DeckInput): AckResult<{ room: Room }> {
    const room = this.store.get(roomId);
    if (!room) return fail({ code: "ROOM_NOT_FOUND", message: "Room not found" });
    if (!permissions.canChangeDeck(room, participantId)) {
      return fail({ code: "NOT_ALLOWED", message: "Not allowed to change deck" });
    }

    const deckCheck = validateDeckInput(deckInput);
    if (!deckCheck.valid) return fail(deckCheck.error);

    const normalized = normalizeDeckInput(deckInput);
    room.deck = resolveDeck(normalized);

    // Clear votes and reset reveal since deck changed
    room.votes.clear();
    room.revealed = false;

    touchRoom(room);
    return success({ room });
  }

  updateSettings(
    roomId: RoomId,
    participantId: string,
    settingsUpdate: Partial<RoomSettings>
  ): AckResult<{ room: Room }> {
    const room = this.store.get(roomId);
    if (!room) return fail({ code: "ROOM_NOT_FOUND", message: "Room not found" });
    if (!permissions.canUpdateSettings(room, participantId)) {
      return fail({ code: "NOT_ALLOWED", message: "Only the moderator can update settings" });
    }

    const settingsCheck = validateSettingsUpdate(settingsUpdate);
    if (!settingsCheck.valid) return fail(settingsCheck.error);

    Object.assign(room.settings, settingsUpdate);
    touchRoom(room);
    return success({ room });
  }

  allConnectedVotersVoted(room: Room): boolean {
    let hasVoter = false;
    for (const p of room.participants.values()) {
      if (p.connected && p.role === "voter") {
        if (!room.votes.has(p.id)) return false;
        hasVoter = true;
      }
    }
    return hasVoter;
  }

  private generateUniqueRoomId(): string {
    let id: string;
    do {
      id = generateRoomId();
    } while (this.store.get(id));
    return id;
  }
}
