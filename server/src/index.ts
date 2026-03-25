import { createApp } from "./app.js";
import { createSocketServer } from "./socket.js";
import { RoomStore } from "./services/room-store.js";
import { RoomService } from "./services/room-service.js";
import { SessionService } from "./services/session-service.js";
import { TimerService } from "./services/timer-service.js";
import { CleanupService } from "./services/cleanup-service.js";
import { registerSocketHandlers } from "./transport/socket-handlers.js";
import { PORT, HOST } from "./config.js";
import { logger } from "./utils/logger.js";

async function main() {
  const app = await createApp();
  const httpServer = app.server;

  const io = createSocketServer(httpServer);
  const store = new RoomStore();
  const roomService = new RoomService(store);
  const sessionService = new SessionService();
  const timerService = new TimerService();
  const cleanupService = new CleanupService(store, timerService, io);

  registerSocketHandlers(io, roomService, sessionService, timerService, store);
  cleanupService.start();

  await app.listen({ port: PORT, host: HOST });
  logger.info("Server started", { port: PORT, host: HOST });

  const shutdown = async () => {
    logger.info("Shutting down");
    cleanupService.stop();
    timerService.cancelAll();
    io.close();
    await app.close();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  logger.error("Failed to start server", { error: String(err) });
  process.exit(1);
});
