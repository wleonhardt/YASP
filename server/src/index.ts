import { createApp } from "./app.js";
import { createSocketServer } from "./socket.js";
import { InMemoryRoomStore, type RoomStore } from "./services/room-store.js";
import { RoomService } from "./services/room-service.js";
import { InMemorySessionBindingStore, type SessionBindingStore } from "./services/session-service.js";
import { InMemoryRoomTimerScheduler, type RoomTimerScheduler } from "./services/timer-service.js";
import { CleanupService } from "./services/cleanup-service.js";
import {
  InMemoryActiveRoomSessionResolver,
  type ActiveRoomSessionResolver,
} from "./services/active-room-session-resolver.js";
import { SocketRoomStatePublisher, type RoomStatePublisher } from "./services/room-state-publisher.js";
import { registerSocketHandlers } from "./transport/socket-handlers.js";
import { PORT, HOST, STATE_BACKEND_CONFIG } from "./config.js";
import { createAsyncStateBackend, type AsyncStateBackend } from "./services/state-backend.js";
import { logger } from "./utils/logger.js";

type FatalProcessEvent = "uncaughtException" | "unhandledRejection";

let cleanupServiceRef: CleanupService | null = null;
let timerServiceRef: RoomTimerScheduler | null = null;
let ioRef: ReturnType<typeof createSocketServer> | null = null;
let appRef: Awaited<ReturnType<typeof createApp>> | null = null;
let stateBackendRef: AsyncStateBackend | null = null;
let shuttingDown = false;

function describeUnknownError(value: unknown): {
  message: string;
  stack: string | null;
  context: Record<string, unknown>;
} {
  if (value instanceof Error) {
    return {
      message: value.message || value.name || "Unknown error",
      stack: value.stack ?? null,
      context: {
        name: value.name,
      },
    };
  }

  if (typeof value === "string") {
    return {
      message: value,
      stack: null,
      context: {
        valueType: "string",
      },
    };
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) {
    return {
      message: String(value),
      stack: null,
      context: {
        valueType: value === null ? "null" : typeof value,
      },
    };
  }

  try {
    return {
      message: "Non-Error throwable",
      stack: null,
      context: {
        valueType: Object.prototype.toString.call(value),
        serialized: JSON.stringify(value),
      },
    };
  } catch {
    return {
      message: "Non-Error throwable",
      stack: null,
      context: {
        valueType: Object.prototype.toString.call(value),
      },
    };
  }
}

async function shutdown(reason: string, exitCode: number): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info("Shutting down", { reason, exitCode });

  cleanupServiceRef?.stop();
  timerServiceRef?.cancelAll();
  ioRef?.close();

  if (stateBackendRef) {
    try {
      await stateBackendRef.close();
    } catch (error) {
      logger.error("Failed to close state backend cleanly", {
        reason,
        exitCode,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    stateBackendRef = null;
  }

  if (appRef) {
    try {
      await appRef.close();
    } catch (error) {
      logger.error("Failed to close app cleanly", {
        reason,
        exitCode,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  process.exit(exitCode);
}

function handleFatalProcessEvent(event: FatalProcessEvent, error: unknown): void {
  const details = describeUnknownError(error);

  logger.error("Fatal process event", {
    event,
    timestamp: new Date().toISOString(),
    message: details.message,
    stack: details.stack,
    context: {
      pid: process.pid,
      nodeVersion: process.version,
      uptimeSeconds: Math.round(process.uptime()),
      ...details.context,
    },
  });

  void shutdown(event, 1);
}

process.on("uncaughtException", (error) => {
  handleFatalProcessEvent("uncaughtException", error);
});

process.on("unhandledRejection", (reason) => {
  handleFatalProcessEvent("unhandledRejection", reason);
});

async function main() {
  // Phase 2 horizontal-scaling: construct (and validate) the configured
  // backend up front. For `memory` this is cheap and always succeeds. For
  // `redis` this connects to Redis and PINGs it so misconfiguration fails at
  // startup instead of on first room. The prototypes are not yet wired to
  // RoomService — see ADR 0002 — so we refuse to start in redis mode with a
  // clear error once the Redis health-check has proven config validity.
  logger.info("Selecting state backend", { backend: STATE_BACKEND_CONFIG.kind });
  const stateBackend = await createAsyncStateBackend(STATE_BACKEND_CONFIG);
  stateBackendRef = stateBackend;

  if (stateBackend.kind === "redis") {
    throw new Error(
      "YASP_STATE_BACKEND=redis is a Phase 2 prototype. Redis connectivity was " +
        "verified, but RoomService is not yet wired onto the async store " +
        "interface (see plans/decisions/0002-redis-backed-state-prototypes.md). " +
        "Restart with YASP_STATE_BACKEND=memory (the default)."
    );
  }

  const app = await createApp();
  appRef = app;
  const httpServer = app.server;

  const io = createSocketServer(httpServer);
  ioRef = io;
  const store: RoomStore = new InMemoryRoomStore();
  const roomService = new RoomService(store);
  const sessionBindingStore: SessionBindingStore = new InMemorySessionBindingStore();
  const activeSessionResolver: ActiveRoomSessionResolver = new InMemoryActiveRoomSessionResolver(
    sessionBindingStore,
    store
  );
  const timerService: RoomTimerScheduler = new InMemoryRoomTimerScheduler();
  const roomStatePublisher: RoomStatePublisher = new SocketRoomStatePublisher(io, store);
  timerServiceRef = timerService;
  const cleanupService = new CleanupService(store, timerService, roomStatePublisher);
  cleanupServiceRef = cleanupService;

  registerSocketHandlers(
    io,
    roomService,
    sessionBindingStore,
    activeSessionResolver,
    timerService,
    roomStatePublisher,
    store
  );
  cleanupService.start();

  await app.listen({ port: PORT, host: HOST });
  logger.info("Server started", { port: PORT, host: HOST });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM", 0);
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT", 0);
  });
}

main().catch((err) => {
  logger.error("Failed to start server", {
    event: "startup_failure",
    timestamp: new Date().toISOString(),
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : null,
  });
  void shutdown("startup_failure", 1);
});
