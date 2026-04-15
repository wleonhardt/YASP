import type { RoomId, SocketId } from "@yasp/shared";
import type { AsyncRoomStore } from "./async-room-store.js";
import type { AsyncSessionBindingStore } from "./async-session-binding-store.js";
import type { ActiveRoomSessionResolution } from "./active-room-session-resolver.js";

/**
 * Async counterpart to the in-memory active-session resolver for Redis mode.
 */
export class AsyncActiveRoomSessionResolver {
  constructor(
    private readonly bindings: AsyncSessionBindingStore,
    private readonly rooms: AsyncRoomStore
  ) {}

  async resolve(socketId: SocketId, roomId: RoomId): Promise<ActiveRoomSessionResolution> {
    const binding = await this.bindings.resolve(socketId);
    if (!binding || binding.roomId !== roomId) {
      return { ok: false, code: "PARTICIPANT_NOT_FOUND", message: "Not in this room" };
    }

    const room = await this.rooms.get(roomId);
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
