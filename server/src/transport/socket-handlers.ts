import type { Server as SocketServer, Socket } from "socket.io";
import type {
  AckResult,
  CastVoteInput,
  ChangeDeckInput,
  ChangeNameInput,
  ChangeRoleInput,
  CreateRoomInput,
  CreateRoomOutput,
  ErrorCode,
  JoinRoomInput,
  JoinRoomOutput,
  LeaveRoomInput,
  RoomId,
  SetTimerDurationInput,
  TransferModeratorInput,
  UpdateSettingsInput,
  PingInput,
  PongEvent,
} from "@yasp/shared";
import type { Room } from "../domain/types.js";
import { RoomService } from "../services/room-service.js";
import { SessionService } from "../services/session-service.js";
import { TimerService } from "../services/timer-service.js";
import type { RoomStore } from "../services/room-store.js";
import { serializeRoom } from "./serializers.js";
import { validateSessionId, validateRoomId } from "./validators.js";
import { applySocketRateLimit } from "./rate-limiter.js";
import { tryAcquireConnection, releaseConnection } from "./connection-limiter.js";
import { extractClientIp } from "./ip.js";
import { TRUSTED_PROXY_HOP_COUNT } from "../config.js";
import { now } from "../utils/time.js";
import { logger } from "../utils/logger.js";

type RoomActionAfterEffect = "autoReveal" | "cancelAutoReveal" | "syncRoomTimer" | "cancelRoomTimer" | "none";

function ackFail(code: ErrorCode, message: string): AckResult<never> {
  return { ok: false, error: { code, message } };
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
): { sessionId: string } | null {
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

  return { sessionId: binding.sessionId };
}

function evaluateAutoReveal(
  room: Room,
  roomService: RoomService,
  timerService: TimerService,
  io: SocketServer,
  store: RoomStore
): void {
  if (!room.settings.autoReveal || room.revealed) {
    timerService.cancelAutoReveal(room.id);
    return;
  }

  if (roomService.allConnectedVotersVoted(room)) {
    timerService.scheduleAutoReveal(room.id, room.settings.autoRevealDelayMs, () => {
      const current = store.get(room.id);
      if (!current || current.revealed) return;
      if (!roomService.allConnectedVotersVoted(current)) return;
      current.revealed = true;
      broadcastRoomState(io, room.id, store);
    });
  } else {
    timerService.cancelAutoReveal(room.id);
  }
}

function syncRoomTimer(
  roomId: RoomId,
  roomService: RoomService,
  timerService: TimerService,
  io: SocketServer,
  store: RoomStore
): void {
  timerService.cancelRoomTimer(roomId);

  const room = store.get(roomId);
  if (!room || !room.timer.running || room.timer.endsAt === null) {
    return;
  }

  const delayMs = Math.max(0, room.timer.endsAt - now());
  timerService.scheduleRoomTimer(roomId, delayMs, () => {
    const result = roomService.completeTimer(roomId);
    if (!result.ok) {
      return;
    }

    timerService.cancelAutoReveal(roomId);
    broadcastRoomState(io, roomId, store);
  });
}

export function registerSocketHandlers(
  io: SocketServer,
  roomService: RoomService,
  sessionService: SessionService,
  timerService: TimerService,
  store: RoomStore
): void {
  // Per-IP concurrent connection cap. Runs as Socket.IO connect middleware
  // so rejected upgrades never enter the main connection handler and never
  // allocate the downstream rate-limiter / handler state.
  io.use((socket, next) => {
    const handshake = socket.handshake;
    // Resolve the real viewer IP through the trusted proxy chain. In
    // production this strips the nginx loopback hop and the CloudFront edge
    // hop from the right of X-Forwarded-For; in dev/tests (no proxy) this
    // collapses to the direct TCP peer.
    const ip = extractClientIp(handshake.headers, handshake.address, TRUSTED_PROXY_HOP_COUNT);
    if (!tryAcquireConnection(ip)) {
      logger.warn("Socket connection rejected: per-IP cap", { ip });
      next(new Error("CONNECTION_LIMIT"));
      return;
    }
    // Stash the resolved IP on the socket so downstream handlers don't
    // re-derive it (and so tests / logs have one source of truth).
    socket.data.clientIp = ip;
    next();
  });

  io.on("connection", (socket: Socket) => {
    const clientIp: string = socket.data.clientIp ?? "unknown";
    applySocketRateLimit(socket, clientIp);

    // Pair the connection acquire/release. Use `disconnect` which fires for
    // normal closes, transport errors, and server-side disconnects alike.
    socket.on("disconnect", () => {
      releaseConnection(clientIp);
    });

    const refreshRoomState = (roomId: RoomId, room: Room | null = store.get(roomId) ?? null) => {
      broadcastRoomState(io, roomId, store);
      if (room) {
        evaluateAutoReveal(room, roomService, timerService, io, store);
      }
      syncRoomTimer(roomId, roomService, timerService, io, store);
    };

    // Helper: resolve caller, run service method, ack+broadcast on success.
    // afterEffect controls timer/auto-reveal behavior after broadcast.
    function roomAction<I extends { roomId: RoomId } & Record<string, unknown>>(
      event: string,
      serviceFn: (roomId: RoomId, sessionId: string, input: I) => AckResult<{ room: Room }>,
      afterEffect: RoomActionAfterEffect = "none"
    ) {
      socket.on(event, (input: I, ack?: (res: AckResult) => void) => {
        const caller = resolveCallerFromSocket(socket, sessionService, input.roomId, store, ack);
        if (!caller) return;

        const result = serviceFn(input.roomId, caller.sessionId, input);
        if (!result.ok) {
          ack?.(result);
          return;
        }

        ack?.({ ok: true, data: undefined });
        if (afterEffect === "cancelAutoReveal") timerService.cancelAutoReveal(input.roomId);
        if (afterEffect === "cancelRoomTimer") timerService.cancelRoomTimer(input.roomId);
        broadcastRoomState(io, input.roomId, store);
        if (afterEffect === "autoReveal") {
          evaluateAutoReveal(result.data.room, roomService, timerService, io, store);
        }
        if (afterEffect === "syncRoomTimer") {
          syncRoomTimer(input.roomId, roomService, timerService, io, store);
        }
      });
    }

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

      const { room } = result.data;
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
      refreshRoomState(room.id, room);
    });

    socket.on("leave_room", (input: LeaveRoomInput, ack?: (res: AckResult) => void) => {
      const caller = resolveCallerFromSocket(socket, sessionService, input.roomId, store, ack);
      if (!caller) return;

      const result = roomService.leaveRoom(input.roomId, caller.sessionId);
      if (!result.ok) {
        ack?.(result);
        return;
      }

      sessionService.unbind(socket.id);
      socket.leave(input.roomId);
      ack?.({ ok: true, data: undefined });

      refreshRoomState(input.roomId, result.data.room);
    });

    roomAction(
      "cast_vote",
      (roomId, pid, i: CastVoteInput) => roomService.castVote(roomId, pid, i.value),
      "autoReveal"
    );
    roomAction("clear_vote", (roomId, pid) => roomService.clearVote(roomId, pid), "autoReveal");
    roomAction("reveal_votes", (roomId, pid) => roomService.revealVotes(roomId, pid), "cancelAutoReveal");
    roomAction("reset_round", (roomId, pid) => roomService.resetRound(roomId, pid), "cancelAutoReveal");
    roomAction("next_round", (roomId, pid) => roomService.nextRound(roomId, pid), "cancelAutoReveal");
    roomAction("transfer_moderator", (roomId, pid, i: TransferModeratorInput) =>
      roomService.transferModerator(roomId, pid, i.targetParticipantId)
    );
    roomAction(
      "set_timer_duration",
      (roomId, pid, i: SetTimerDurationInput) => roomService.setTimerDuration(roomId, pid, i.durationSeconds),
      "cancelRoomTimer"
    );
    roomAction("start_timer", (roomId, pid) => roomService.startTimer(roomId, pid), "syncRoomTimer");
    roomAction("pause_timer", (roomId, pid) => roomService.pauseTimer(roomId, pid), "cancelRoomTimer");
    roomAction("reset_timer", (roomId, pid) => roomService.resetTimer(roomId, pid), "cancelRoomTimer");
    roomAction("honk_timer", (roomId, pid) => roomService.honkTimer(roomId, pid));
    roomAction("change_name", (roomId, pid, i: ChangeNameInput) =>
      roomService.changeName(roomId, pid, i.name)
    );
    roomAction(
      "change_role",
      (roomId, pid, i: ChangeRoleInput) => roomService.changeRole(roomId, pid, i.role),
      "autoReveal"
    );
    roomAction(
      "change_deck",
      (roomId, pid, i: ChangeDeckInput) => roomService.changeDeck(roomId, pid, i.deck),
      "cancelAutoReveal"
    );
    roomAction(
      "update_settings",
      (roomId, pid, i: UpdateSettingsInput) => roomService.updateSettings(roomId, pid, i.settings),
      "autoReveal"
    );

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
          const result = roomService.disconnectParticipant(roomId, sessionId);
          if (result.ok) {
            refreshRoomState(roomId, result.data.room);
          }
        }
      }

      sessionService.unbind(socket.id);
    });
  });
}
