import type { RoomId, SocketId } from "@yasp/shared";
import type { Server as SocketServer } from "socket.io";
import { serializeRoom } from "../transport/serializers.js";
import type { RoomStore } from "./room-store.js";

/**
 * Emits room-state updates for the current process.
 *
 * Future scaling work can replace this with a publisher that combines local
 * Socket.IO delivery with cross-instance fan-out, without touching room
 * domain logic.
 */
export interface RoomStatePublisher {
  broadcastRoomState(roomId: RoomId): void;
  notifySessionReplaced(socketId: SocketId): void;
}

export class SocketRoomStatePublisher implements RoomStatePublisher {
  constructor(
    private io: SocketServer,
    private rooms: RoomStore
  ) {}

  broadcastRoomState(roomId: RoomId): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    for (const participant of room.participants.values()) {
      if (participant.connected && participant.socketId) {
        this.io.to(participant.socketId).emit("room_state", serializeRoom(room, participant.sessionId));
      }
    }
  }

  notifySessionReplaced(socketId: SocketId): void {
    this.io.to(socketId).emit("server_error", {
      code: "SESSION_REPLACED",
      message: "Your session has been taken over by another tab",
    });
  }
}
