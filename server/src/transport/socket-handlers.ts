import type { Server as SocketServer, Socket } from "socket.io";
import type { AckResult, RoomId } from "@yasp/shared";
import type {
  CreateRoomInput,
  CreateRoomOutput,
  JoinRoomInput,
  JoinRoomOutput,
  LeaveRoomInput,
  PingInput,
  PongEvent,
} from "@yasp/shared";
import { RoomService } from "../services/room-service.js";
import { SessionService } from "../services/session-service.js";
import { TimerService } from "../services/timer-service.js";
import type { RoomStore } from "../services/room-store.js";
import { serializeRoom } from "./serializers.js";
import { validateSessionId, validateRoomId } from "./validators.js";
import { now } from "../utils/time.js";

function ackFail(code: string, message: string): AckResult<never> {
  return { ok: false, error: { code: code as any, message } };
}

function broadcastRoomState(io: SocketServer, roomId: RoomId, store: RoomStore): void {
  const room = store.get(roomId);
  if (!room) return;
  for (const p of room.participants.values()) {
    if (p.connected && p.socketId) {
      io.to(p.socketId).emit("room_state", serializeRoom(room, p.sessionId));
    }
  }
}

function resolveCallerFromSocket(
  socket: Socket,
  sessionService: SessionService,
  roomId: RoomId,
  store: RoomStore,
  ack?: (res: AckResult) => void
): { participantId: string } | null {
  const binding = sessionService.resolve(socket.id);
  if (!binding || binding.roomId !== roomId) {
    ack?.(ackFail("PARTICIPANT_NOT_FOUND", "Not in this room"));
    return null;
  }

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

  return { participantId: binding.sessionId };
}

function evaluateAutoReveal(
  room: import("../domain/types.js").Room,
  roomService: RoomService,
  timerService: TimerService,
  io: SocketServer,
  store: RoomStore
): void {
  if (!room.settings.autoReveal || room.revealed) {
    timerService.cancel(room.id);
    return;
  }

  if (roomService.allConnectedVotersVoted(room)) {
    timerService.schedule(room.id, room.settings.autoRevealDelayMs, () => {
      const current = store.get(room.id);
      if (!current || current.revealed) return;
      if (!roomService.allConnectedVotersVoted(current)) return;
      current.revealed = true;
      broadcastRoomState(io, room.id, store);
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
  store: RoomStore
): void {
  io.on("connection", (socket: Socket) => {
    // Helper: resolve caller, run service method, ack+broadcast on success.
    // afterEffect controls timer/auto-reveal behavior after broadcast.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function roomAction<I extends { roomId: RoomId;[key: string]: any }>(
      event: string,
      serviceFn: (roomId: RoomId, participantId: string, input: I) => AckResult<{ room: import("../domain/types.js").Room }>,
      afterEffect: "autoReveal" | "cancelTimer" | "none" = "none"
    ) {
      socket.on(event, (input: I, ack?: (res: AckResult) => void) => {
        const caller = resolveCallerFromSocket(socket, sessionService, input.roomId, store, ack);
        if (!caller) return;

        const result = serviceFn(input.roomId, caller.participantId, input);
        if (!result.ok) { ack?.(result); return; }

        ack?.({ ok: true, data: undefined });
        if (afterEffect === "cancelTimer") timerService.cancel(input.roomId);
        broadcastRoomState(io, input.roomId, store);
        if (afterEffect === "autoReveal") {
          evaluateAutoReveal(result.data.room, roomService, timerService, io, store);
        }
      });
    }

    socket.on("create_room", (input: CreateRoomInput, ack?: (res: AckResult<CreateRoomOutput>) => void) => {
      const sessionCheck = validateSessionId(input.sessionId);
      if (!sessionCheck.valid) { ack?.({ ok: false, error: sessionCheck.error }); return; }

      const result = roomService.createRoom(input.sessionId, socket.id, input.displayName, input.requestedRole, input.deck);
      if (!result.ok) { ack?.(result as AckResult<CreateRoomOutput>); return; }

      const { room } = result.data;
      sessionService.bind(socket.id, input.sessionId, room.id);
      socket.join(room.id);

      const state = serializeRoom(room, input.sessionId);
      ack?.({ ok: true, data: { roomId: room.id, state } });
      socket.emit("room_state", state);
    });

    socket.on("join_room", (input: JoinRoomInput, ack?: (res: AckResult<JoinRoomOutput>) => void) => {
      const sessionCheck = validateSessionId(input.sessionId);
      if (!sessionCheck.valid) { ack?.({ ok: false, error: sessionCheck.error }); return; }

      const roomIdCheck = validateRoomId(input.roomId);
      if (!roomIdCheck.valid) { ack?.({ ok: false, error: roomIdCheck.error }); return; }

      const result = roomService.joinRoom(input.roomId, input.sessionId, socket.id, input.displayName, input.requestedRole);
      if (!result.ok) { ack?.(result as AckResult<JoinRoomOutput>); return; }

      const { room, replacedSocketId } = result.data;
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
      broadcastRoomState(io, room.id, store);
      evaluateAutoReveal(room, roomService, timerService, io, store);
    });

    socket.on("leave_room", (input: LeaveRoomInput, ack?: (res: AckResult) => void) => {
      const caller = resolveCallerFromSocket(socket, sessionService, input.roomId, store, ack);
      if (!caller) return;

      const result = roomService.leaveRoom(input.roomId, caller.participantId);
      if (!result.ok) { ack?.(result); return; }

      sessionService.unbind(socket.id);
      socket.leave(input.roomId);
      ack?.({ ok: true, data: undefined });

      broadcastRoomState(io, input.roomId, store);
      evaluateAutoReveal(result.data.room, roomService, timerService, io, store);
    });

    roomAction("cast_vote", (roomId, pid, i) => roomService.castVote(roomId, pid, i.value), "autoReveal");
    roomAction("clear_vote", (roomId, pid) => roomService.clearVote(roomId, pid), "autoReveal");
    roomAction("reveal_votes", (roomId, pid) => roomService.revealVotes(roomId, pid), "cancelTimer");
    roomAction("reset_round", (roomId, pid) => roomService.resetRound(roomId, pid), "cancelTimer");
    roomAction("next_round", (roomId, pid) => roomService.nextRound(roomId, pid), "cancelTimer");
    roomAction("transfer_moderator", (roomId, pid, i) => roomService.transferModerator(roomId, pid, i.targetParticipantId));
    roomAction("change_name", (roomId, pid, i) => roomService.changeName(roomId, pid, i.name));
    roomAction("change_role", (roomId, pid, i) => roomService.changeRole(roomId, pid, i.role), "autoReveal");
    roomAction("change_deck", (roomId, pid, i) => roomService.changeDeck(roomId, pid, i.deck), "cancelTimer");
    roomAction("update_settings", (roomId, pid, i) => roomService.updateSettings(roomId, pid, i.settings), "autoReveal");

    socket.on("ping", (input: PingInput, ack?: (res: PongEvent) => void) => {
      ack?.({ clientTs: input.clientTs, serverTs: now() });
    });

    socket.on("disconnect", () => {
      const binding = sessionService.resolve(socket.id);
      if (!binding) return;

      const { sessionId, roomId } = binding;
      const room = store.get(roomId);

      if (room) {
        const participant = room.participants.get(sessionId);
        if (participant && participant.socketId === socket.id) {
          roomService.disconnectParticipant(roomId, sessionId);
          broadcastRoomState(io, roomId, store);
          evaluateAutoReveal(room, roomService, timerService, io, store);
        }
      }

      sessionService.unbind(socket.id);
    });
  });
}
