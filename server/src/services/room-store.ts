import type { RoomId } from "@yasp/shared";
import type { Room } from "../domain/types.js";

/**
 * Stores only the current active room state.
 *
 * Future distributed implementations may share active rooms across app
 * instances, but must preserve YASP's ephemeral model: no history, archives,
 * replay, or durable audit trail.
 */
export interface RoomStore {
  get(roomId: RoomId): Room | undefined;
  save(room: Room): void;
  delete(roomId: RoomId): void;
  list(): Room[];
}

export class InMemoryRoomStore implements RoomStore {
  private rooms = new Map<RoomId, Room>();

  get(roomId: RoomId): Room | undefined {
    return this.rooms.get(roomId);
  }

  save(room: Room): void {
    this.rooms.set(room.id, room);
  }

  delete(roomId: RoomId): void {
    this.rooms.delete(roomId);
  }

  list(): Room[] {
    return Array.from(this.rooms.values());
  }
}
