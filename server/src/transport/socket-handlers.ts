import type { Server as SocketServer, Socket } from "socket.io";
import type {
  AckResult,
  SessionId,
  RoomId,
} from "@yasp/shared";
import type {
  CreateRoomInput,
  CreateRoomOutput,
  JoinRoomInput,
  JoinRoomOutput,
  LeaveRoomInput,
  CastVoteInput,
  ClearVoteInput,
  RevealVotesInput,
  ResetRoundInput,
  NextRoundInput,
  TransferModeratorInput,
  ChangeNameInput,
  ChangeRoleInput,
  ChangeDeckInput,
  UpdateSettingsInput,
  PingInput,
  PongEvent,
} from "@yasp/shared";
import { RoomService } from "../services/room-service.js";
import { SessionService } from "../services/session-service.js";
import { TimerService } from "../services/timer-service.js";
import { serializeRoom } from "./serializers.js";
import { validateSessionId, validateRoomId } from "./validators.js";
import { logger } from "../utils/logger.js";
import { now } from "../utils/time.js";

function ackFail(code: string, message: string): AckResult<never> {
  return { ok: false, error: { code: code as any, message } };
}

function broadcastRoomState(
  io: SocketServer,
  roomService: RoomService,
  roomId: RoomId,
  store: import("../services/room-store.js").RoomStore
): void {
  const room = store.get(roomId);
  if (!room) return;
  for (const p of room.participants.values()) {
    if (p.connected && p.socketId) {
      const state = serializeRoom(room, p.sessionId);
      io.to(p.socketId).emit("room_state", state);
    }
  }
}

/**
 * Resolves caller identity from a socket, verifying active-socket authority.
 * Returns null with appropriate ack error if the socket is not authorized.
 */
function resolveCallerFromSocket(
  socket: Socket,
  sessionService: SessionService,
  roomId: RoomId,
  store: import("../services/room-store.js").RoomStore,
  ack?: (res: AckResult) => void
): { sessionId: SessionId; participantId: string } | null {
  const binding = sessionService.resolve(socket.id);
  if (!binding || binding.roomId !== roomId) {
    ack?.(ackFail("PARTICIPANT_NOT_FOUND", "Not in this room"));
    return null;
  }

  // Verify this socket is still the active binding for the participant.
  // A newer join_room from the same sessionId may have replaced us.
  const room = store.get(roomId);
  if (!room) {
    ack?.(ackFail("ROOM_NOT_FOUND", "Room not found"));
    return null;
  }
  const participant = room.participants.get(binding.sessionId);
  if (!participant) {
    ack?.(ackFail("PARTICIPANT_NOT_FOUND", "Not in this room"));
    return null;
  }
  if (participant.socketId !== socket.id) {
    ack?.(ackFail("SESSION_REPLACED", "Session replaced by another connection"));
    return null;
  }

  return { sessionId: binding.sessionId, participantId: binding.sessionId };
}

function evaluateAutoReveal(
  room: import("../domain/types.js").Room,
  roomService: RoomService,
  timerService: TimerService,
  io: SocketServer,
  store: import("../services/room-store.js").RoomStore
): void {
  if (!room.settings.autoReveal || room.revealed) {
    timerService.cancel(room.id);
    return;
  }

  if (roomService.allConnectedVotersVoted(room)) {
    timerService.schedule(room.id, room.settings.autoRevealDelayMs, () => {
      const current = store.get(room.id);
      if (!current || current.revealed) return;
      // Re-check conditions at fire time
      if (!roomService.allConnectedVotersVoted(current)) return;
      current.revealed = true;
      broadcastRoomState(io, roomService, room.id, store);
    });
  } else {
    timerService.cancel(room.id);
  }
}

export function registerSocketHandlers(
  io: SocketServer,
  roomService: RoomService,
  sessionService: SessionService,
  timerService: TimerService,
  store: import("../services/room-store.js").RoomStore
): void {
  io.on("connection", (socket: Socket) => {
    socket.on("create_room", (input: CreateRoomInput, ack?: (res: AckResult<CreateRoomOutput>) => void) => {
      const sessionCheck = validateSessionId(input.sessionId);
      if (!sessionCheck.valid) {
        ack?.({ ok: false, error: sessionCheck.error });
        return;
      }

      const result = roomService.createRoom(
        input.sessionId,
        socket.id,
        input.displayName,
        input.requestedRole,
        input.deck
      );

      if (!result.ok) {
        ack?.(result as AckResult<CreateRoomOutput>);
        return;
      }

      const { room, participantId } = result.data;
      sessionService.bind(socket.id, input.sessionId, room.id);
      socket.join(room.id);

      const state = serializeRoom(room, input.sessionId);
      ack?.({ ok: true, data: { roomId: room.id, state } });
      socket.emit("room_state", state);
    });

    socket.on("join_room", (input: JoinRoomInput, ack?: (res: AckResult<JoinRoomOutput>) => void) => {
      const sessionCheck = validateSessionId(input.sessionId);
      if (!sessionCheck.valid) {
        ack?.({ ok: false, error: sessionCheck.error });
        return;
      }

      const roomIdCheck = validateRoomId(input.roomId);
      if (!roomIdCheck.valid) {
        ack?.({ ok: false, error: roomIdCheck.error });
        return;
      }

      const result = roomService.joinRoom(
        input.roomId,
        input.sessionId,
        socket.id,
        input.displayName,
        input.requestedRole
      );

      if (!result.ok) {
        ack?.(result as AckResult<JoinRoomOutput>);
        return;
      }

      const { room, replacedSocketId } = result.data;

      // Handle session replacement
      if (replacedSocketId && replacedSocketId !== socket.id) {
        io.to(replacedSocketId).emit("server_error", {
          code: "SESSION_REPLACED",
          message: "Your session has been taken over by another tab",
        });
      }

      sessionService.bind(socket.id, input.sessionId, room.id);
      socket.join(room.id);

      const state = serializeRoom(room, input.sessionId);
      ack?.({ ok: true, data: { state } });

      // Broadcast to all participants
      broadcastRoomState(io, roomService, room.id, store);

      // Re-evaluate auto-reveal
      evaluateAutoReveal(room, roomService, timerService, io, store);
    });

    socket.on("leave_room", (input: LeaveRoomInput, ack?: (res: AckResult) => void) => {
      const caller = resolveCallerFromSocket(socket, sessionService, input.roomId, store, ack);
      if (!caller) return;

      const result = roomService.leaveRoom(input.roomId, caller.participantId);
      if (!result.ok) {
        ack?.(result);
        return;
      }

      sessionService.unbind(socket.id);
      socket.leave(input.roomId);
      ack?.({ ok: true, data: undefined });

      broadcastRoomState(io, roomService, input.roomId, store);
      evaluateAutoReveal(result.data.room, roomService, timerService, io, store);
    });

    socket.on("cast_vote", (input: CastVoteInput, ack?: (res: AckResult) => void) => {
      const caller = resolveCallerFromSocket(socket, sessionService, input.roomId, store, ack);
      if (!caller) return;

      const result = roomService.castVote(input.roomId, caller.participantId, input.value);
      if (!result.ok) {
        ack?.(result);
        return;
      }

      ack?.({ ok: true, data: undefined });
      broadcastRoomState(io, roomService, input.roomId, store);
      evaluateAutoReveal(result.data.room, roomService, timerService, io, store);
    });

    socket.on("clear_vote", (input: ClearVoteInput, ack?: (res: AckResult) => void) => {
      const caller = resolveCallerFromSocket(socket, sessionService, input.roomId, store, ack);
      if (!caller) return;

      const result = roomService.clearVote(input.roomId, caller.participantId);
      if (!result.ok) {
        ack?.(result);
        return;
      }

      ack?.({ ok: true, data: undefined });
      broadcastRoomState(io, roomService, input.roomId, store);
      evaluateAutoReveal(result.data.room, roomService, timerService, io, store);
    });

    socket.on("reveal_votes", (input: RevealVotesInput, ack?: (res: AckResult) => void) => {
      const caller = resolveCallerFromSocket(socket, sessionService, input.roomId, store, ack);
      if (!caller) return;

      const result = roomService.revealVotes(input.roomId, caller.participantId);
      if (!result.ok) {
        ack?.(result);
        return;
      }

      ack?.({ ok: true, data: undefined });
      timerService.cancel(input.roomId);
      broadcastRoomState(io, roomService, input.roomId, store);
    });

    socket.on("reset_round", (input: ResetRoundInput, ack?: (res: AckResult) => void) => {
      const caller = resolveCallerFromSocket(socket, sessionService, input.roomId, store, ack);
      if (!caller) return;

      const result = roomService.resetRound(input.roomId, caller.participantId);
      if (!result.ok) {
        ack?.(result);
        return;
      }

      ack?.({ ok: true, data: undefined });
      timerService.cancel(input.roomId);
      broadcastRoomState(io, roomService, input.roomId, store);
    });

    socket.on("next_round", (input: NextRoundInput, ack?: (res: AckResult) => void) => {
      const caller = resolveCallerFromSocket(socket, sessionService, input.roomId, store, ack);
      if (!caller) return;

      const result = roomService.nextRound(input.roomId, caller.participantId);
      if (!result.ok) {
        ack?.(result);
        return;
      }

      ack?.({ ok: true, data: undefined });
      timerService.cancel(input.roomId);
      broadcastRoomState(io, roomService, input.roomId, store);
    });

    socket.on("transfer_moderator", (input: TransferModeratorInput, ack?: (res: AckResult) => void) => {
      const caller = resolveCallerFromSocket(socket, sessionService, input.roomId, store, ack);
      if (!caller) return;

      const result = roomService.transferModerator(
        input.roomId,
        caller.participantId,
        input.targetParticipantId
      );
      if (!result.ok) {
        ack?.(result);
        return;
      }

      ack?.({ ok: true, data: undefined });
      broadcastRoomState(io, roomService, input.roomId, store);
    });

    socket.on("change_name", (input: ChangeNameInput, ack?: (res: AckResult) => void) => {
      const caller = resolveCallerFromSocket(socket, sessionService, input.roomId, store, ack);
      if (!caller) return;

      const result = roomService.changeName(input.roomId, caller.participantId, input.name);
      if (!result.ok) {
        ack?.(result);
        return;
      }

      ack?.({ ok: true, data: undefined });
      broadcastRoomState(io, roomService, input.roomId, store);
    });

    socket.on("change_role", (input: ChangeRoleInput, ack?: (res: AckResult) => void) => {
      const caller = resolveCallerFromSocket(socket, sessionService, input.roomId, store, ack);
      if (!caller) return;

      const result = roomService.changeRole(input.roomId, caller.participantId, input.role);
      if (!result.ok) {
        ack?.(result);
        return;
      }

      ack?.({ ok: true, data: undefined });
      broadcastRoomState(io, roomService, input.roomId, store);
      const room = store.get(input.roomId);
      if (room) evaluateAutoReveal(room, roomService, timerService, io, store);
    });

    socket.on("change_deck", (input: ChangeDeckInput, ack?: (res: AckResult) => void) => {
      const caller = resolveCallerFromSocket(socket, sessionService, input.roomId, store, ack);
      if (!caller) return;

      const result = roomService.changeDeck(input.roomId, caller.participantId, input.deck);
      if (!result.ok) {
        ack?.(result);
        return;
      }

      ack?.({ ok: true, data: undefined });
      timerService.cancel(input.roomId);
      broadcastRoomState(io, roomService, input.roomId, store);
    });

    socket.on("update_settings", (input: UpdateSettingsInput, ack?: (res: AckResult) => void) => {
      const caller = resolveCallerFromSocket(socket, sessionService, input.roomId, store, ack);
      if (!caller) return;

      const result = roomService.updateSettings(input.roomId, caller.participantId, input.settings);
      if (!result.ok) {
        ack?.(result);
        return;
      }

      ack?.({ ok: true, data: undefined });
      broadcastRoomState(io, roomService, input.roomId, store);
      const room = store.get(input.roomId);
      if (room) evaluateAutoReveal(room, roomService, timerService, io, store);
    });

    socket.on("ping", (input: PingInput, ack?: (res: PongEvent) => void) => {
      ack?.({ clientTs: input.clientTs, serverTs: now() });
    });

    // Handle disconnect
    socket.on("disconnect", () => {
      const binding = sessionService.resolve(socket.id);
      if (!binding) return;

      const { sessionId, roomId } = binding;
      const room = store.get(roomId);

      if (room) {
        const participant = room.participants.get(sessionId);
        // Only disconnect if this socket is still the active one for this participant
        if (participant && participant.socketId === socket.id) {
          roomService.disconnectParticipant(roomId, sessionId);
          broadcastRoomState(io, roomService, roomId, store);
          evaluateAutoReveal(room, roomService, timerService, io, store);
        }
      }

      sessionService.unbind(socket.id);
    });
  });
}
