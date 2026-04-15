import type { FastifyListenOptions } from "fastify";
import { createApp } from "./app.js";
import { createSocketServer } from "./socket.js";
import { InMemoryRoomStore, type RoomStore } from "./services/room-store.js";
import { RoomService } from "./services/room-service.js";
import { InMemorySessionBindingStore, type SessionBindingStore } from "./services/session-service.js";
import { InMemoryRoomTimerScheduler, type RoomTimerScheduler } from "./services/timer-service.js";
import { CleanupService } from "./services/cleanup-service.js";
import { AsyncCleanupService } from "./services/async-cleanup-service.js";
import {
  InMemoryActiveRoomSessionResolver,
  type ActiveRoomSessionResolver,
} from "./services/active-room-session-resolver.js";
import { AsyncActiveRoomSessionResolver } from "./services/async-active-room-session-resolver.js";
import { SocketRoomStatePublisher, type RoomStatePublisher } from "./services/room-state-publisher.js";
import { AsyncSocketRoomStatePublisher } from "./services/async-room-state-publisher.js";
import { registerSocketHandlers } from "./transport/socket-handlers.js";
import { createAsyncStateBackend, type AsyncStateBackend } from "./services/state-backend.js";
import type { StateBackendConfig } from "./config.js";
import { AsyncOperationQueue } from "./services/async-operation-queue.js";
import { AsyncRoomService } from "./services/async-room-service.js";
import type { AsyncRoomStore } from "./services/async-room-store.js";
import type { AsyncSessionBindingStore } from "./services/async-session-binding-store.js";

type CleanupController = CleanupService | AsyncCleanupService;

type BaseRuntime = {
  readonly app: Awaited<ReturnType<typeof createApp>>;
  readonly io: ReturnType<typeof createSocketServer>;
  readonly timerService: RoomTimerScheduler;
  readonly cleanupService: CleanupController;
  listen(options: FastifyListenOptions): Promise<void>;
  runCleanupOnce(): Promise<void>;
  close(): Promise<void>;
};

export type ServerRuntime =
  | (BaseRuntime & {
      readonly kind: "memory";
      readonly roomStore: RoomStore;
      readonly sessionBindingStore: SessionBindingStore;
      readonly stateBackend: null;
    })
  | (BaseRuntime & {
      readonly kind: "redis";
      readonly roomStore: AsyncRoomStore;
      readonly sessionBindingStore: AsyncSessionBindingStore;
      readonly stateBackend: AsyncStateBackend;
    });

export async function createServerRuntime(config: StateBackendConfig): Promise<ServerRuntime> {
  const app = await createApp();
  const io = createSocketServer(app.server);
  const timerService: RoomTimerScheduler = new InMemoryRoomTimerScheduler();

  if (config.kind === "memory") {
    const roomStore: RoomStore = new InMemoryRoomStore();
    const roomService = new RoomService(roomStore);
    const sessionBindingStore: SessionBindingStore = new InMemorySessionBindingStore();
    const activeSessionResolver: ActiveRoomSessionResolver = new InMemoryActiveRoomSessionResolver(
      sessionBindingStore,
      roomStore
    );
    const roomStatePublisher: RoomStatePublisher = new SocketRoomStatePublisher(io, roomStore);
    const cleanupService = new CleanupService(roomStore, timerService, roomStatePublisher);

    registerSocketHandlers(
      io,
      roomService,
      sessionBindingStore,
      activeSessionResolver,
      timerService,
      roomStatePublisher,
      roomStore
    );

    return {
      kind: "memory",
      app,
      io,
      timerService,
      cleanupService,
      roomStore,
      sessionBindingStore,
      stateBackend: null,
      async listen(options: FastifyListenOptions): Promise<void> {
        cleanupService.start();
        try {
          await app.listen(options);
        } catch (error) {
          cleanupService.stop();
          throw error;
        }
      },
      async runCleanupOnce(): Promise<void> {
        cleanupService.run();
      },
      async close(): Promise<void> {
        cleanupService.stop();
        timerService.cancelAll();
        io.close();
        await app.close();
      },
    };
  }

  const stateBackend = await createAsyncStateBackend(config);
  const operationQueue = new AsyncOperationQueue();
  const roomService = new AsyncRoomService(stateBackend.roomStore, operationQueue);
  const activeSessionResolver = new AsyncActiveRoomSessionResolver(
    stateBackend.sessionBindingStore,
    stateBackend.roomStore
  );
  const roomStatePublisher = new AsyncSocketRoomStatePublisher(io, stateBackend.roomStore);
  const cleanupService = new AsyncCleanupService(
    stateBackend.roomStore,
    timerService,
    roomStatePublisher,
    operationQueue
  );

  registerSocketHandlers(
    io,
    roomService,
    stateBackend.sessionBindingStore,
    activeSessionResolver,
    timerService,
    roomStatePublisher,
    stateBackend.roomStore
  );

  return {
    kind: "redis",
    app,
    io,
    timerService,
    cleanupService,
    roomStore: stateBackend.roomStore,
    sessionBindingStore: stateBackend.sessionBindingStore,
    stateBackend,
    async listen(options: FastifyListenOptions): Promise<void> {
      cleanupService.start();
      try {
        await app.listen(options);
      } catch (error) {
        cleanupService.stop();
        throw error;
      }
    },
    async runCleanupOnce(): Promise<void> {
      await cleanupService.run();
    },
    async close(): Promise<void> {
      cleanupService.stop();
      timerService.cancelAll();
      io.close();
      try {
        await stateBackend.close();
      } finally {
        await app.close();
      }
    },
  };
}
