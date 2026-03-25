import { Server as SocketServer } from "socket.io";
import type { Server as HttpServer } from "http";

export function createSocketServer(httpServer: HttpServer): SocketServer {
  return new SocketServer(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === "production" ? false : ["http://localhost:5173"],
      methods: ["GET", "POST"],
    },
    pingTimeout: 20000,
    pingInterval: 25000,
  });
}
