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
import type { RoomStore } from "./room-store.js";
import { resolveDeck } from "../domain/deck.js";
import {
  reassignModeratorIfNeeded,
  findNextModerator,
  hasConnectedParticipants,
  findParticipantBySessionId,
  findParticipantByPublicId,
} from "../domain/room.js";
import { createRoomTimerState, getRemainingSeconds } from "../domain/timer.js";
import * as permissions from "../domain/permissions.js";
import { generateParticipantId, generateRoomId } from "../utils/id.js";
import { now } from "../utils/time.js";
import {
  ROOM_TTL_MS,
  EMPTY_ROOM_TTL_MS,
  MAX_ROOM_PARTICIPANTS,
  MAX_ACTIVE_ROOMS,
  MAX_ROOMS_MODERATED_PER_SESSION,
  PARTICIPANT_HONK_COOLDOWN_MS,
} from "../config.js";
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
  // Any call-site that reaches touchRoom is a real action (join, vote, reveal,
  // reset, deck change, settings change, name/role change, timer op). Flip
  // the activity flag so disconnect handling no longer applies the shorter
  // empty-room TTL to this room.
  room.hasBeenActive = true;
}

/**
 * Count how many currently-stored rooms have this session as moderator.
 * O(N rooms); called only on create_room, which is already rare relative
 * to other socket traffic. Avoids keeping a separate index (and the
 * invariant-maintenance burden) for a cap that only needs to hold against
 * honest clients.
 */
function countRoomsModeratedBy(rooms: Iterable<Room>, sessionId: SessionId): number {
  let count = 0;
  for (const room of rooms) {
    const participant = room.participants.get(sessionId);
    if (participant && room.moderatorId === participant.id) {
      count++;
    }
  }
  return count;
}

function resetRoundState(room: Room): void {
  room.votes.clear();
  room.revealed = false;
}

export function allConnectedVotersVoted(room: Room): boolean {
  let hasVoter = false;
  for (const participant of room.participants.values()) {
    if (participant.connected && participant.role === "voter") {
      if (!room.votes.has(participant.id)) return false;
      hasVoter = true;
    }
  }
  return hasVoter;
}

function stopRoomTimer(room: Room): void {
  room.timer.running = false;
  room.timer.endsAt = null;
}

const ROOM_TIMER_PRESETS = Array.isArray(ROOM_TIMER_PRESET_SECONDS)
  ? ROOM_TIMER_PRESET_SECONDS
  : ([10, 30, 60, 120, 300] as const);

export class RoomService {
  constructor(private store: RoomStore) {}

  private saveRoom(room: Room): void {
    this.store.save(room);
  }

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

    // Global cap: stop new allocations above MAX_ACTIVE_ROOMS. Existing rooms
    // keep working; only new create_room calls are rejected.
    const activeRooms = this.store.list();
    if (activeRooms.length >= MAX_ACTIVE_ROOMS) {
      logger.warn("Room creation rejected: global cap", { activeRooms: activeRooms.length });
      return fail({ code: "SERVER_BUSY", message: "Server is at capacity, try again later" });
    }

    // Per-session cap: one sessionId can moderate up to
    // MAX_ROOMS_MODERATED_PER_SESSION rooms at any moment. This is an honest-
    // client sanity check; attackers rotating sessionIds are constrained by
    // the per-IP connection and event caps.
    if (countRoomsModeratedBy(activeRooms, sessionId) >= MAX_ROOMS_MODERATED_PER_SESSION) {
      logger.warn("Room creation rejected: per-session moderator cap", { sessionId });
      return fail({
        code: "TOO_MANY_ROOMS",
        message: "Too many active rooms for this session",
      });
    }

    const roomId = this.generateUniqueRoomId();
    const t = now();
    const participantId = generateParticipantId();

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
      // Starts false. Flipped true by touchRoom on the first real activity
      // (second participant join, vote, reveal, etc.). Rooms that stay false
      // and lose their last connected participant get EMPTY_ROOM_TTL_MS.
      hasBeenActive: false,
      revealed: false,
      roundNumber: 1,
      deck: resolveDeck(deckInput),
      settings: { ...DEFAULT_ROOM_SETTINGS },
      timer: createRoomTimerState(),
      moderatorId: participantId,
      previousModeratorId: null,
      participants: new Map([[sessionId, participant]]),
      votes: new Map(),
    };

    this.saveRoom(room);
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

    const existing = findParticipantBySessionId(room, sessionId);

    // Enforce participant limit for new joins (reconnects are always allowed)
    if (!existing && room.participants.size >= MAX_ROOM_PARTICIPANTS) {
      return fail({ code: "ROOM_FULL", message: "Room is full" });
    }
    let replacedSocketId: SocketId | null = null;
    let participantId: string;

    if (existing) {
      participantId = existing.id;
      const reconnectedAt = now();
      // Reconnect / tab takeover
      replacedSocketId = existing.socketId;
      existing.socketId = socketId;
      existing.connected = true;
      existing.lastSeenAt = reconnectedAt;
      // Only update name on reconnect if name changes are allowed
      if (room.settings.allowNameChange) {
        existing.name = sanitizeName(displayName);
      }
      // Restore moderator status if this participant was auto-demoted on disconnect
      if (room.previousModeratorId === existing.id) {
        room.moderatorId = existing.id;
        room.previousModeratorId = null;
        logger.info("Moderator restored on reconnect", { roomId, participantId: existing.id });
      }
      // Preserve prior vote for current round
    } else {
      participantId = generateParticipantId();
      const joinedAt = now();
      // New participant
      const participant: Participant = {
        id: participantId,
        sessionId,
        name: sanitizeName(displayName),
        role: requestedRole,
        connected: true,
        socketId,
        joinedAt,
        lastSeenAt: joinedAt,
      };
      room.participants.set(sessionId, participant);
    }

    // Assign moderator if none
    if (!room.moderatorId) {
      room.moderatorId = participantId;
    }

    touchRoom(room);
    this.saveRoom(room);
    logger.info("Participant joined", { roomId, participantId });
    return success({ room, participantId, replacedSocketId });
  }

  leaveRoom(roomId: RoomId, sessionId: string): AckResult<{ room: Room }> {
    const room = this.store.get(roomId);
    if (!room) return fail({ code: "ROOM_NOT_FOUND", message: "Room not found" });

    const participant = findParticipantBySessionId(room, sessionId);
    if (!participant) return fail({ code: "PARTICIPANT_NOT_FOUND", message: "Participant not found" });

    // Remove participant and their vote
    room.participants.delete(sessionId);
    room.votes.delete(participant.id);

    // Clear auto-restore if the previous moderator is leaving
    if (room.previousModeratorId === participant.id) {
      room.previousModeratorId = null;
    }

    // Reassign moderator if needed
    if (room.moderatorId === participant.id) {
      room.moderatorId = null;
      reassignModeratorIfNeeded(room);
    }

    touchRoom(room);
    this.saveRoom(room);
    return success({ room });
  }

  disconnectParticipant(roomId: RoomId, sessionId: string): AckResult<{ room: Room }> {
    const room = this.store.get(roomId);
    if (!room) return fail({ code: "ROOM_NOT_FOUND", message: "Room not found" });

    const participant = findParticipantBySessionId(room, sessionId);
    if (!participant) return fail({ code: "PARTICIPANT_NOT_FOUND", message: "Participant not found" });

    const disconnectedAt = now();
    participant.connected = false;
    participant.socketId = null;
    participant.lastSeenAt = disconnectedAt;

    // If the moderator disconnected, hand off to the next connected participant
    // so the room isn't stuck without anyone who can reveal/reset.
    // Track the previous moderator so we can restore them on reconnect.
    if (room.moderatorId === participant.id && hasConnectedParticipants(room)) {
      const next = findNextModerator(room, participant.id);
      if (next && next.connected) {
        room.previousModeratorId = participant.id;
        room.moderatorId = next.id;
        logger.info("Moderator disconnected, auto-transferred", {
          roomId,
          from: participant.id,
          to: next.id,
        });
      }
    }

    // If no connected participants remain, reset expiry. Rooms that have
    // never had real activity get the shorter EMPTY_ROOM_TTL_MS so
    // create-and-abandon spam is reaped quickly. Rooms with real activity
    // keep the full ROOM_TTL_MS so participants who briefly disconnect
    // (tab reload, network blip, short break) can reconnect to their room.
    if (!hasConnectedParticipants(room)) {
      const ttl = room.hasBeenActive ? ROOM_TTL_MS : EMPTY_ROOM_TTL_MS;
      room.expiresAt = disconnectedAt + ttl;
    }

    logger.info("Participant disconnected", { roomId, participantId: participant.id });
    this.saveRoom(room);
    return success({ room });
  }

  castVote(roomId: RoomId, sessionId: string, value: VoteValue): AckResult<{ room: Room }> {
    const room = this.store.get(roomId);
    if (!room) return fail({ code: "ROOM_NOT_FOUND", message: "Room not found" });

    const participant = findParticipantBySessionId(room, sessionId);
    if (!participant) return fail({ code: "PARTICIPANT_NOT_FOUND", message: "Participant not found" });
    if (!participant.connected) return fail({ code: "NOT_ALLOWED", message: "Participant is not connected" });
    if (participant.role !== "voter") return fail({ code: "NOT_ALLOWED", message: "Spectators cannot vote" });
    if (room.revealed) return fail({ code: "ALREADY_REVEALED", message: "Votes have already been revealed" });

    const voteCheck = validateVote(value, room.deck.cards);
    if (!voteCheck.valid) return fail(voteCheck.error);

    room.votes.set(participant.id, value);
    touchRoom(room);
    this.saveRoom(room);
    return success({ room });
  }

  clearVote(roomId: RoomId, sessionId: string): AckResult<{ room: Room }> {
    const room = this.store.get(roomId);
    if (!room) return fail({ code: "ROOM_NOT_FOUND", message: "Room not found" });

    const participant = findParticipantBySessionId(room, sessionId);
    if (!participant) return fail({ code: "PARTICIPANT_NOT_FOUND", message: "Participant not found" });
    if (room.revealed) return fail({ code: "ALREADY_REVEALED", message: "Cannot clear vote after reveal" });

    room.votes.delete(participant.id);
    touchRoom(room);
    this.saveRoom(room);
    return success({ room });
  }

  revealVotes(roomId: RoomId, sessionId: string): AckResult<{ room: Room }> {
    const room = this.store.get(roomId);
    if (!room) return fail({ code: "ROOM_NOT_FOUND", message: "Room not found" });
    if (room.revealed) return fail({ code: "ALREADY_REVEALED", message: "Already revealed" });
    const participant = findParticipantBySessionId(room, sessionId);
    if (!participant) return fail({ code: "PARTICIPANT_NOT_FOUND", message: "Participant not found" });
    if (!permissions.canReveal(room, participant.id)) {
      return fail({ code: "NOT_ALLOWED", message: "Not allowed to reveal votes" });
    }

    room.revealed = true;
    touchRoom(room);
    this.saveRoom(room);
    return success({ room });
  }

  autoRevealIfReady(roomId: RoomId): AckResult<{ room: Room; changed: boolean }> {
    const room = this.store.get(roomId);
    if (!room) return fail({ code: "ROOM_NOT_FOUND", message: "Room not found" });
    if (room.revealed || !room.settings.autoReveal || !allConnectedVotersVoted(room)) {
      return success({ room, changed: false });
    }

    // Mirror the pre-Phase-3 socket callback behavior: auto-reveal flips the
    // reveal bit without extending last-activity / expiry.
    room.revealed = true;
    this.saveRoom(room);
    return success({ room, changed: true });
  }

  resetRound(roomId: RoomId, sessionId: string): AckResult<{ room: Room }> {
    const room = this.store.get(roomId);
    if (!room) return fail({ code: "ROOM_NOT_FOUND", message: "Room not found" });
    const participant = findParticipantBySessionId(room, sessionId);
    if (!participant) return fail({ code: "PARTICIPANT_NOT_FOUND", message: "Participant not found" });
    if (!permissions.canReset(room, participant.id)) {
      return fail({ code: "NOT_ALLOWED", message: "Not allowed to reset round" });
    }

    resetRoundState(room);
    touchRoom(room);
    this.saveRoom(room);
    return success({ room });
  }

  nextRound(roomId: RoomId, sessionId: string): AckResult<{ room: Room }> {
    const room = this.store.get(roomId);
    if (!room) return fail({ code: "ROOM_NOT_FOUND", message: "Room not found" });
    const participant = findParticipantBySessionId(room, sessionId);
    if (!participant) return fail({ code: "PARTICIPANT_NOT_FOUND", message: "Participant not found" });
    if (!permissions.canNextRound(room, participant.id)) {
      return fail({ code: "NOT_ALLOWED", message: "Not allowed to advance round" });
    }

    resetRoundState(room);
    room.roundNumber += 1;
    touchRoom(room);
    this.saveRoom(room);
    return success({ room });
  }

  transferModerator(
    roomId: RoomId,
    sessionId: string,
    targetParticipantId: string
  ): AckResult<{ room: Room }> {
    const room = this.store.get(roomId);
    if (!room) return fail({ code: "ROOM_NOT_FOUND", message: "Room not found" });

    const participant = findParticipantBySessionId(room, sessionId);
    if (!participant) return fail({ code: "PARTICIPANT_NOT_FOUND", message: "Participant not found" });
    if (!permissions.canTransferModerator(room, participant.id)) {
      return fail({ code: "NOT_ALLOWED", message: "Only the moderator can transfer host" });
    }
    if (participant.id === targetParticipantId) {
      return fail({ code: "NOT_ALLOWED", message: "Choose another participant to transfer host" });
    }

    const targetParticipant = findParticipantByPublicId(room, targetParticipantId);
    if (!targetParticipant) {
      return fail({ code: "PARTICIPANT_NOT_FOUND", message: "Participant not found" });
    }

    room.moderatorId = targetParticipant.id;
    room.previousModeratorId = null; // Manual transfer clears auto-restore
    touchRoom(room);
    this.saveRoom(room);
    return success({ room });
  }

  setTimerDuration(roomId: RoomId, sessionId: string, durationSeconds: number): AckResult<{ room: Room }> {
    const room = this.store.get(roomId);
    if (!room) return fail({ code: "ROOM_NOT_FOUND", message: "Room not found" });
    const participant = findParticipantBySessionId(room, sessionId);
    if (!participant) return fail({ code: "PARTICIPANT_NOT_FOUND", message: "Participant not found" });
    if (!permissions.isModerator(room, participant.id)) {
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
    this.saveRoom(room);
    return success({ room });
  }

  startTimer(roomId: RoomId, sessionId: string): AckResult<{ room: Room }> {
    const room = this.store.get(roomId);
    if (!room) return fail({ code: "ROOM_NOT_FOUND", message: "Room not found" });
    const participant = findParticipantBySessionId(room, sessionId);
    if (!participant) return fail({ code: "PARTICIPANT_NOT_FOUND", message: "Participant not found" });
    if (!permissions.isModerator(room, participant.id)) {
      return fail({ code: "NOT_ALLOWED", message: "Only the moderator can start the timer" });
    }

    const remainingSeconds =
      room.timer.remainingSeconds > 0 ? room.timer.remainingSeconds : room.timer.durationSeconds;
    room.timer.running = true;
    room.timer.remainingSeconds = remainingSeconds;
    room.timer.endsAt = now() + remainingSeconds * 1000;
    room.timer.completedAt = null;
    touchRoom(room);
    this.saveRoom(room);
    return success({ room });
  }

  pauseTimer(roomId: RoomId, sessionId: string): AckResult<{ room: Room }> {
    const room = this.store.get(roomId);
    if (!room) return fail({ code: "ROOM_NOT_FOUND", message: "Room not found" });
    const participant = findParticipantBySessionId(room, sessionId);
    if (!participant) return fail({ code: "PARTICIPANT_NOT_FOUND", message: "Participant not found" });
    if (!permissions.isModerator(room, participant.id)) {
      return fail({ code: "NOT_ALLOWED", message: "Only the moderator can pause the timer" });
    }

    room.timer.remainingSeconds = getRemainingSeconds(room.timer, now());
    stopRoomTimer(room);
    touchRoom(room);
    this.saveRoom(room);
    return success({ room });
  }

  resetTimer(roomId: RoomId, sessionId: string): AckResult<{ room: Room }> {
    const room = this.store.get(roomId);
    if (!room) return fail({ code: "ROOM_NOT_FOUND", message: "Room not found" });
    const participant = findParticipantBySessionId(room, sessionId);
    if (!participant) return fail({ code: "PARTICIPANT_NOT_FOUND", message: "Participant not found" });
    if (!permissions.isModerator(room, participant.id)) {
      return fail({ code: "NOT_ALLOWED", message: "Only the moderator can reset the timer" });
    }

    stopRoomTimer(room);
    room.timer.remainingSeconds = room.timer.durationSeconds;
    room.timer.completedAt = null;
    touchRoom(room);
    this.saveRoom(room);
    return success({ room });
  }

  completeTimer(roomId: RoomId): AckResult<{ room: Room }> {
    const room = this.store.get(roomId);
    if (!room) return fail({ code: "ROOM_NOT_FOUND", message: "Room not found" });

    stopRoomTimer(room);
    room.timer.remainingSeconds = 0;
    room.timer.completedAt = now();
    room.revealed = true;
    touchRoom(room);
    this.saveRoom(room);
    return success({ room });
  }

  honkTimer(roomId: RoomId, sessionId: string): AckResult<{ room: Room }> {
    const room = this.store.get(roomId);
    if (!room) return fail({ code: "ROOM_NOT_FOUND", message: "Room not found" });
    const participant = findParticipantBySessionId(room, sessionId);
    if (!participant) return fail({ code: "PARTICIPANT_NOT_FOUND", message: "Participant not found" });
    if (!permissions.isModerator(room, participant.id)) {
      return fail({ code: "NOT_ALLOWED", message: "Only the moderator can honk the timer" });
    }

    const t = now();
    // Room-level cooldown first — keeps the broadcast rate bounded regardless
    // of who is honking.
    if (room.timer.honkAvailableAt !== null && t < room.timer.honkAvailableAt) {
      return fail({ code: "NOT_ALLOWED", message: "Please wait before sending another reminder" });
    }
    // Per-participant cooldown (F-10). Defense-in-depth: today only the
    // moderator can honk and the 5s room gate is strictly tighter, but this
    // guarantees a single sender cannot exceed the per-participant rate even
    // if the permission model ever widens or the room-level gate is relaxed.
    if (participant.lastHonkAt !== undefined && t - participant.lastHonkAt < PARTICIPANT_HONK_COOLDOWN_MS) {
      return fail({ code: "NOT_ALLOWED", message: "Please wait before sending another reminder" });
    }

    participant.lastHonkAt = t;
    room.timer.lastHonkAt = t;
    room.timer.honkAvailableAt = t + ROOM_TIMER_HONK_COOLDOWN_MS;
    touchRoom(room);
    this.saveRoom(room);
    return success({ room });
  }

  changeName(roomId: RoomId, sessionId: string, name: string): AckResult<{ room: Room }> {
    const room = this.store.get(roomId);
    if (!room) return fail({ code: "ROOM_NOT_FOUND", message: "Room not found" });
    if (!permissions.canChangeName(room)) {
      return fail({ code: "NAME_CHANGE_DISABLED", message: "Name changes are disabled" });
    }

    const nameCheck = validateName(name);
    if (!nameCheck.valid) return fail(nameCheck.error);

    const participant = findParticipantBySessionId(room, sessionId);
    if (!participant) return fail({ code: "PARTICIPANT_NOT_FOUND", message: "Participant not found" });

    participant.name = sanitizeName(name);
    touchRoom(room);
    this.saveRoom(room);
    return success({ room });
  }

  changeRole(roomId: RoomId, sessionId: string, role: ParticipantRole): AckResult<{ room: Room }> {
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

    const participant = findParticipantBySessionId(room, sessionId);
    if (!participant) return fail({ code: "PARTICIPANT_NOT_FOUND", message: "Participant not found" });

    participant.role = role;

    // If switching to spectator, remove their vote
    if (role === "spectator") {
      room.votes.delete(participant.id);
    }

    touchRoom(room);
    this.saveRoom(room);
    return success({ room });
  }

  changeDeck(roomId: RoomId, sessionId: string, deckInput: DeckInput): AckResult<{ room: Room }> {
    const room = this.store.get(roomId);
    if (!room) return fail({ code: "ROOM_NOT_FOUND", message: "Room not found" });
    const participant = findParticipantBySessionId(room, sessionId);
    if (!participant) return fail({ code: "PARTICIPANT_NOT_FOUND", message: "Participant not found" });
    if (!permissions.canChangeDeck(room, participant.id)) {
      return fail({ code: "NOT_ALLOWED", message: "Not allowed to change deck" });
    }

    const deckCheck = validateDeckInput(deckInput);
    if (!deckCheck.valid) return fail(deckCheck.error);

    const normalized = normalizeDeckInput(deckInput);
    room.deck = resolveDeck(normalized);

    // Clear votes and reset reveal since deck changed
    resetRoundState(room);

    touchRoom(room);
    this.saveRoom(room);
    return success({ room });
  }

  updateSettings(
    roomId: RoomId,
    sessionId: string,
    settingsUpdate: Partial<RoomSettings>
  ): AckResult<{ room: Room }> {
    const room = this.store.get(roomId);
    if (!room) return fail({ code: "ROOM_NOT_FOUND", message: "Room not found" });
    const participant = findParticipantBySessionId(room, sessionId);
    if (!participant) return fail({ code: "PARTICIPANT_NOT_FOUND", message: "Participant not found" });
    if (!permissions.canUpdateSettings(room, participant.id)) {
      return fail({ code: "NOT_ALLOWED", message: "Only the moderator can update settings" });
    }

    const settingsCheck = validateSettingsUpdate(settingsUpdate);
    if (!settingsCheck.valid) return fail(settingsCheck.error);

    Object.assign(room.settings, settingsUpdate);
    touchRoom(room);
    this.saveRoom(room);
    return success({ room });
  }

  allConnectedVotersVoted(room: Room): boolean {
    return allConnectedVotersVoted(room);
  }

  private generateUniqueRoomId(): string {
    let id: string;
    do {
      id = generateRoomId();
    } while (this.store.get(id));
    return id;
  }
}
