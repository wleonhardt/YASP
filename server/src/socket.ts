import { Server as SocketServer } from "socket.io";
import type { Server as HttpServer } from "http";
import { SOCKET_MAX_HTTP_BUFFER_SIZE } from "./config.js";

export function createSocketServer(httpServer: HttpServer): SocketServer {
  return new SocketServer(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === "production" ? false : ["http://localhost:5173"],
      methods: ["GET", "POST"],
    },
    pingTimeout: 20000,
    pingInterval: 25000,
    // Cap the single-message payload well below the Socket.IO default of 1 MB.
    // YASP's largest legitimate event (full room_state with MAX_ROOM_PARTICIPANTS
    // participants) is well under 16 KB. Any client pushing larger messages is
    // either broken or abusive.
    maxHttpBufferSize: SOCKET_MAX_HTTP_BUFFER_SIZE,
    // Disable permessage-deflate. YASP payloads are small and already fit
    // within the buffer cap; enabling compression adds CPU cost and exposes
    // known WebSocket compression-bomb abuse vectors for no measurable win.
    perMessageDeflate: false,
  });
}
