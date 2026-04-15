import type { RoomId, SocketId } from "@yasp/shared";
import type { Server as SocketServer } from "socket.io";
import { serializeRoom } from "../transport/serializers.js";
import type { AsyncRoomStore } from "./async-room-store.js";

/**
 * Redis-mode publisher: reads the latest room snapshot from the async store
 * and emits it to sockets connected to this process.
 */
export class AsyncSocketRoomStatePublisher {
  constructor(
    private readonly io: SocketServer,
    private readonly rooms: AsyncRoomStore
  ) {}

  async broadcastRoomState(roomId: RoomId): Promise<void> {
    const room = await this.rooms.get(roomId);
    if (!room) return;

    for (const participant of room.participants.values()) {
      if (participant.connected && participant.socketId) {
        this.io.to(participant.socketId).emit("room_state", serializeRoom(room, participant.sessionId));
      }
    }
  }

  async notifySessionReplaced(socketId: SocketId): Promise<void> {
    this.io.to(socketId).emit("server_error", {
      code: "SESSION_REPLACED",
      message: "Your session has been taken over by another tab",
    });
  }
}
