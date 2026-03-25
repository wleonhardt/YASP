import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const url = import.meta.env.PROD ? "/" : "http://localhost:3001";
    socket = io(url, {
      autoConnect: false,
      transports: ["websocket", "polling"],
    });
  }
  return socket;
}
