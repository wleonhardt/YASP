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
import type { SessionBindingStore } from "../services/session-service.js";
import type { RoomTimerScheduler } from "../services/timer-service.js";
import type { RoomStore } from "../services/room-store.js";
import type { ActiveRoomSessionResolver } from "../services/active-room-session-resolver.js";
import type { RoomStatePublisher } from "../services/room-state-publisher.js";
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

function evaluateAutoReveal(
  room: Room,
  roomService: RoomService,
  timerScheduler: RoomTimerScheduler,
  roomStatePublisher: RoomStatePublisher,
  store: RoomStore
): void {
  if (!room.settings.autoReveal || room.revealed) {
    timerScheduler.cancelAutoReveal(room.id);
    return;
  }

  if (roomService.allConnectedVotersVoted(room)) {
    timerScheduler.scheduleAutoReveal(room.id, room.settings.autoRevealDelayMs, () => {
      const current = store.get(room.id);
      if (!current || current.revealed) return;
      if (!roomService.allConnectedVotersVoted(current)) return;
      current.revealed = true;
      store.save(current);
      roomStatePublisher.broadcastRoomState(room.id);
    });
  } else {
    timerScheduler.cancelAutoReveal(room.id);
  }
}

function syncRoomTimer(
  roomId: RoomId,
  roomService: RoomService,
  timerScheduler: RoomTimerScheduler,
  roomStatePublisher: RoomStatePublisher,
  store: RoomStore
): void {
  timerScheduler.cancelRoomTimer(roomId);

  const room = store.get(roomId);
  if (!room || !room.timer.running || room.timer.endsAt === null) {
    return;
  }

  const delayMs = Math.max(0, room.timer.endsAt - now());
  timerScheduler.scheduleRoomTimer(roomId, delayMs, () => {
    const result = roomService.completeTimer(roomId);
    if (!result.ok) {
      return;
    }

    timerScheduler.cancelAutoReveal(roomId);
    roomStatePublisher.broadcastRoomState(roomId);
  });
}

export function registerSocketHandlers(
  io: SocketServer,
  roomService: RoomService,
  sessionBindingStore: SessionBindingStore,
  activeSessionResolver: ActiveRoomSessionResolver,
  timerScheduler: RoomTimerScheduler,
  roomStatePublisher: RoomStatePublisher,
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
      roomStatePublisher.broadcastRoomState(roomId);
      if (room) {
        evaluateAutoReveal(room, roomService, timerScheduler, roomStatePublisher, store);
      }
      syncRoomTimer(roomId, roomService, timerScheduler, roomStatePublisher, store);
    };

    // Helper: resolve caller, run service method, ack+broadcast on success.
    // afterEffect controls timer/auto-reveal behavior after broadcast.
    // These after-effects are intentionally localized here so a future
    // distributed coordinator can replace them without changing room-domain
    // logic or socket event names.
    function roomAction<I extends { roomId: RoomId } & Record<string, unknown>>(
      event: string,
      serviceFn: (roomId: RoomId, sessionId: string, input: I) => AckResult<{ room: Room }>,
      afterEffect: RoomActionAfterEffect = "none"
    ) {
      socket.on(event, (input: I, ack?: (res: AckResult) => void) => {
        const resolution = activeSessionResolver.resolve(socket.id, input.roomId);
        if (!resolution.ok) {
          ack?.(ackFail(resolution.code, resolution.message));
          return;
        }

        const result = serviceFn(input.roomId, resolution.sessionId, input);
        if (!result.ok) {
          ack?.(result);
          return;
        }

        ack?.({ ok: true, data: undefined });
        if (afterEffect === "cancelAutoReveal") timerScheduler.cancelAutoReveal(input.roomId);
        if (afterEffect === "cancelRoomTimer") timerScheduler.cancelRoomTimer(input.roomId);
        roomStatePublisher.broadcastRoomState(input.roomId);
        if (afterEffect === "autoReveal") {
          evaluateAutoReveal(result.data.room, roomService, timerScheduler, roomStatePublisher, store);
        }
        if (afterEffect === "syncRoomTimer") {
          syncRoomTimer(input.roomId, roomService, timerScheduler, roomStatePublisher, store);
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
      sessionBindingStore.bind(socket.id, input.sessionId, room.id);
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
        roomStatePublisher.notifySessionReplaced(replacedSocketId);
      }

      sessionBindingStore.bind(socket.id, input.sessionId, room.id);
      socket.join(room.id);

      const state = serializeRoom(room, input.sessionId);
      ack?.({ ok: true, data: { state } });
      refreshRoomState(room.id, room);
    });

    socket.on("leave_room", (input: LeaveRoomInput, ack?: (res: AckResult) => void) => {
      const resolution = activeSessionResolver.resolve(socket.id, input.roomId);
      if (!resolution.ok) {
        ack?.(ackFail(resolution.code, resolution.message));
        return;
      }

      const result = roomService.leaveRoom(input.roomId, resolution.sessionId);
      if (!result.ok) {
        ack?.(result);
        return;
      }

      sessionBindingStore.unbind(socket.id);
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
      const binding = sessionBindingStore.resolve(socket.id);
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

      sessionBindingStore.unbind(socket.id);
    });
  });
}
