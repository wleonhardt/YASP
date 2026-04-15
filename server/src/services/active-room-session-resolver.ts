import type { ErrorCode, RoomId, SessionId, SocketId } from "@yasp/shared";
import type { RoomStore } from "./room-store.js";
import type { SessionBindingStore } from "./session-service.js";

export type ActiveRoomSessionResolution =
  | { ok: true; sessionId: SessionId }
  | { ok: false; code: ErrorCode; message: string };

/**
 * Resolves whether a socket still owns the active session for a room.
 *
 * This keeps latest-tab-wins logic behind a dedicated seam so a future
 * distributed implementation can swap the ownership check without rewriting
 * the socket handlers.
 */
export interface ActiveRoomSessionResolver {
  resolve(socketId: SocketId, roomId: RoomId): ActiveRoomSessionResolution;
}

export class InMemoryActiveRoomSessionResolver implements ActiveRoomSessionResolver {
  constructor(
    private bindings: SessionBindingStore,
    private rooms: RoomStore
  ) {}

  resolve(socketId: SocketId, roomId: RoomId): ActiveRoomSessionResolution {
    const binding = this.bindings.resolve(socketId);
    if (!binding || binding.roomId !== roomId) {
      return { ok: false, code: "PARTICIPANT_NOT_FOUND", message: "Not in this room" };
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      return { ok: false, code: "ROOM_NOT_FOUND", message: "Room not found" };
    }

    const participant = room.participants.get(binding.sessionId);
    if (!participant) {
      return { ok: false, code: "PARTICIPANT_NOT_FOUND", message: "Not in this room" };
    }

    if (participant.socketId !== socketId) {
      return { ok: false, code: "SESSION_REPLACED", message: "Session replaced by another connection" };
    }

    return { ok: true, sessionId: binding.sessionId };
  }
}
