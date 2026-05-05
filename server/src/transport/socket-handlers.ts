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
import type { RoomTimerScheduler } from "../services/timer-service.js";
import type { ActiveRoomSessionResolution } from "../services/active-room-session-resolver.js";
import { serializeRoom } from "./serializers.js";
import { validateSessionId, validateRoomId } from "./validators.js";
import { applySocketRateLimit } from "./rate-limiter.js";
import { tryAcquireConnection, releaseConnection } from "./connection-limiter.js";
import { extractClientIp } from "./ip.js";
import { TRUSTED_PROXY_HOP_COUNT } from "../config.js";
import { now } from "../utils/time.js";
import { logger } from "../utils/logger.js";

type RoomActionAfterEffect = "autoReveal" | "cancelAutoReveal" | "syncRoomTimer" | "cancelRoomTimer" | "none";
type Awaitable<T> = T | Promise<T>;

type RoomServicePort = {
  createRoom(
    sessionId: string,
    socketId: string,
    displayName: string,
    requestedRole: "voter" | "spectator",
    deck?: CreateRoomInput["deck"]
  ): Awaitable<AckResult<{ room: Room; participantId: string }>>;
  joinRoom(
    roomId: RoomId,
    sessionId: string,
    socketId: string,
    displayName: string,
    requestedRole: "voter" | "spectator"
  ): Awaitable<AckResult<{ room: Room; participantId: string; replacedSocketId: string | null }>>;
  leaveRoom(roomId: RoomId, sessionId: string): Awaitable<AckResult<{ room: Room }>>;
  disconnectParticipant(roomId: RoomId, sessionId: string): Awaitable<AckResult<{ room: Room }>>;
  castVote(
    roomId: RoomId,
    sessionId: string,
    value: CastVoteInput["value"]
  ): Awaitable<AckResult<{ room: Room }>>;
  clearVote(roomId: RoomId, sessionId: string): Awaitable<AckResult<{ room: Room }>>;
  revealVotes(roomId: RoomId, sessionId: string): Awaitable<AckResult<{ room: Room }>>;
  autoRevealIfReady(roomId: RoomId): Awaitable<AckResult<{ room: Room; changed: boolean }>>;
  resetRound(roomId: RoomId, sessionId: string): Awaitable<AckResult<{ room: Room }>>;
  reopenVoting(roomId: RoomId, sessionId: string): Awaitable<AckResult<{ room: Room }>>;
  nextRound(roomId: RoomId, sessionId: string): Awaitable<AckResult<{ room: Room }>>;
  transferModerator(
    roomId: RoomId,
    sessionId: string,
    targetParticipantId: string
  ): Awaitable<AckResult<{ room: Room }>>;
  setTimerDuration(
    roomId: RoomId,
    sessionId: string,
    durationSeconds: number
  ): Awaitable<AckResult<{ room: Room }>>;
  startTimer(roomId: RoomId, sessionId: string): Awaitable<AckResult<{ room: Room }>>;
  pauseTimer(roomId: RoomId, sessionId: string): Awaitable<AckResult<{ room: Room }>>;
  resetTimer(roomId: RoomId, sessionId: string): Awaitable<AckResult<{ room: Room }>>;
  completeTimer(roomId: RoomId): Awaitable<AckResult<{ room: Room }>>;
  honkTimer(roomId: RoomId, sessionId: string): Awaitable<AckResult<{ room: Room }>>;
  changeName(roomId: RoomId, sessionId: string, name: string): Awaitable<AckResult<{ room: Room }>>;
  changeRole(
    roomId: RoomId,
    sessionId: string,
    role: ChangeRoleInput["role"]
  ): Awaitable<AckResult<{ room: Room }>>;
  changeDeck(
    roomId: RoomId,
    sessionId: string,
    deck: ChangeDeckInput["deck"]
  ): Awaitable<AckResult<{ room: Room }>>;
  updateSettings(
    roomId: RoomId,
    sessionId: string,
    settings: UpdateSettingsInput["settings"]
  ): Awaitable<AckResult<{ room: Room }>>;
  allConnectedVotersVoted(room: Room): boolean;
};

type SessionBindingStorePort = {
  bind(socketId: string, sessionId: string, roomId: RoomId): Awaitable<void>;
  unbind(socketId: string): Awaitable<void>;
  resolve(socketId: string): Awaitable<{ sessionId: string; roomId: RoomId } | undefined>;
};

type ActiveRoomSessionResolverPort = {
  resolve(socketId: string, roomId: RoomId): Awaitable<ActiveRoomSessionResolution>;
};

type RoomStatePublisherPort = {
  broadcastRoomState(roomId: RoomId): Awaitable<void>;
  notifySessionReplaced(socketId: string): Awaitable<void>;
};

type RoomReaderPort = {
  get(roomId: RoomId): Awaitable<Room | undefined>;
};

function ackFail(code: ErrorCode, message: string): AckResult<never> {
  return { ok: false, error: { code, message } };
}

function logSocketTaskFailure(socketId: string, event: string, error: unknown): void {
  logger.error("Socket handler task failed", {
    socketId,
    event,
    error: error instanceof Error ? error.message : String(error),
  });
}

function runSocketTask(socketId: string, event: string, task: () => Promise<void>): void {
  void task().catch((error) => {
    logSocketTaskFailure(socketId, event, error);
  });
}

async function evaluateAutoReveal(
  room: Room,
  roomService: RoomServicePort,
  timerScheduler: RoomTimerScheduler,
  roomStatePublisher: RoomStatePublisherPort,
  socketId: string
): Promise<void> {
  if (!room.settings.autoReveal || room.revealed) {
    timerScheduler.cancelAutoReveal(room.id);
    return;
  }

  if (roomService.allConnectedVotersVoted(room)) {
    timerScheduler.scheduleAutoReveal(room.id, room.settings.autoRevealDelayMs, () => {
      runSocketTask(socketId, "auto_reveal_timer", async () => {
        const result = await roomService.autoRevealIfReady(room.id);
        if (!result.ok || !result.data.changed) return;
        await roomStatePublisher.broadcastRoomState(room.id);
      });
    });
  } else {
    timerScheduler.cancelAutoReveal(room.id);
  }
}

async function syncRoomTimer(
  roomId: RoomId,
  roomService: RoomServicePort,
  timerScheduler: RoomTimerScheduler,
  roomStatePublisher: RoomStatePublisherPort,
  store: RoomReaderPort,
  socketId: string
): Promise<void> {
  timerScheduler.cancelRoomTimer(roomId);

  const room = await store.get(roomId);
  if (!room || !room.timer.running || room.timer.endsAt === null) {
    return;
  }

  const delayMs = Math.max(0, room.timer.endsAt - now());
  timerScheduler.scheduleRoomTimer(roomId, delayMs, () => {
    runSocketTask(socketId, "room_timer", async () => {
      const result = await roomService.completeTimer(roomId);
      if (!result.ok) return;

      timerScheduler.cancelAutoReveal(roomId);
      await roomStatePublisher.broadcastRoomState(roomId);
    });
  });
}

export function registerSocketHandlers(
  io: SocketServer,
  roomService: RoomServicePort,
  sessionBindingStore: SessionBindingStorePort,
  activeSessionResolver: ActiveRoomSessionResolverPort,
  timerScheduler: RoomTimerScheduler,
  roomStatePublisher: RoomStatePublisherPort,
  store: RoomReaderPort
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

    const refreshRoomState = async (roomId: RoomId, room?: Room | null) => {
      const currentRoom = room ?? (await store.get(roomId)) ?? null;
      await roomStatePublisher.broadcastRoomState(roomId);
      if (currentRoom) {
        await evaluateAutoReveal(currentRoom, roomService, timerScheduler, roomStatePublisher, socket.id);
      }
      await syncRoomTimer(roomId, roomService, timerScheduler, roomStatePublisher, store, socket.id);
    };

    // Helper: resolve caller, run service method, ack+broadcast on success.
    // afterEffect controls timer/auto-reveal behavior after broadcast.
    // These after-effects are intentionally localized here so a future
    // distributed coordinator can replace them without changing room-domain
    // logic or socket event names.
    function roomAction<I extends { roomId: RoomId } & Record<string, unknown>>(
      event: string,
      serviceFn: (roomId: RoomId, sessionId: string, input: I) => Awaitable<AckResult<{ room: Room }>>,
      afterEffect: RoomActionAfterEffect = "none"
    ) {
      socket.on(event, (input: I, ack?: (res: AckResult) => void) => {
        runSocketTask(socket.id, event, async () => {
          const resolution = await activeSessionResolver.resolve(socket.id, input.roomId);
          if (!resolution.ok) {
            ack?.(ackFail(resolution.code, resolution.message));
            return;
          }

          const result = await serviceFn(input.roomId, resolution.sessionId, input);
          if (!result.ok) {
            ack?.(result);
            return;
          }

          ack?.({ ok: true, data: undefined });
          if (afterEffect === "cancelAutoReveal") timerScheduler.cancelAutoReveal(input.roomId);
          if (afterEffect === "cancelRoomTimer") timerScheduler.cancelRoomTimer(input.roomId);
          await roomStatePublisher.broadcastRoomState(input.roomId);
          if (afterEffect === "autoReveal") {
            await evaluateAutoReveal(
              result.data.room,
              roomService,
              timerScheduler,
              roomStatePublisher,
              socket.id
            );
          }
          if (afterEffect === "syncRoomTimer") {
            await syncRoomTimer(
              input.roomId,
              roomService,
              timerScheduler,
              roomStatePublisher,
              store,
              socket.id
            );
          }
        });
      });
    }

    socket.on("create_room", (input: CreateRoomInput, ack?: (res: AckResult<CreateRoomOutput>) => void) => {
      runSocketTask(socket.id, "create_room", async () => {
        const sessionCheck = validateSessionId(input.sessionId);
        if (!sessionCheck.valid) {
          ack?.({ ok: false, error: sessionCheck.error });
          return;
        }

        const result = await roomService.createRoom(
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
        await sessionBindingStore.bind(socket.id, input.sessionId, room.id);
        await socket.join(room.id);

        const state = serializeRoom(room, input.sessionId);
        ack?.({ ok: true, data: { roomId: room.id, state } });
        socket.emit("room_state", state);
      });
    });

    socket.on("join_room", (input: JoinRoomInput, ack?: (res: AckResult<JoinRoomOutput>) => void) => {
      runSocketTask(socket.id, "join_room", async () => {
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

        const result = await roomService.joinRoom(
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
          await roomStatePublisher.notifySessionReplaced(replacedSocketId);
        }

        await sessionBindingStore.bind(socket.id, input.sessionId, room.id);
        await socket.join(room.id);

        const state = serializeRoom(room, input.sessionId);
        ack?.({ ok: true, data: { state } });
        await refreshRoomState(room.id, room);
      });
    });

    socket.on("leave_room", (input: LeaveRoomInput, ack?: (res: AckResult) => void) => {
      runSocketTask(socket.id, "leave_room", async () => {
        const resolution = await activeSessionResolver.resolve(socket.id, input.roomId);
        if (!resolution.ok) {
          ack?.(ackFail(resolution.code, resolution.message));
          return;
        }

        const result = await roomService.leaveRoom(input.roomId, resolution.sessionId);
        if (!result.ok) {
          ack?.(result);
          return;
        }

        await sessionBindingStore.unbind(socket.id);
        await socket.leave(input.roomId);
        ack?.({ ok: true, data: undefined });

        await refreshRoomState(input.roomId, result.data.room);
      });
    });

    roomAction(
      "cast_vote",
      (roomId, pid, i: CastVoteInput) => roomService.castVote(roomId, pid, i.value),
      "autoReveal"
    );
    roomAction("clear_vote", (roomId, pid) => roomService.clearVote(roomId, pid), "autoReveal");
    roomAction("reveal_votes", (roomId, pid) => roomService.revealVotes(roomId, pid), "cancelAutoReveal");
    roomAction("reset_round", (roomId, pid) => roomService.resetRound(roomId, pid), "cancelAutoReveal");
    roomAction("reopen_voting", (roomId, pid) => roomService.reopenVoting(roomId, pid), "cancelAutoReveal");
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
      runSocketTask(socket.id, "disconnect", async () => {
        const binding = await sessionBindingStore.resolve(socket.id);
        if (!binding) return;

        const { sessionId, roomId } = binding;
        const room = await store.get(roomId);

        if (room) {
          const participant = room.participants.get(sessionId);
          if (participant && participant.socketId === socket.id) {
            const result = await roomService.disconnectParticipant(roomId, sessionId);
            if (result.ok) {
              await refreshRoomState(roomId, result.data.room);
            }
          }
        }

        await sessionBindingStore.unbind(socket.id);
      });
    });
  });
}
