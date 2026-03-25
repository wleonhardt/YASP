import type { RoomId } from "@yasp/shared";
import type { Room } from "../domain/types.js";

export class RoomStore {
  private rooms = new Map<RoomId, Room>();

  get(roomId: RoomId): Room | undefined {
    return this.rooms.get(roomId);
  }

  set(room: Room): void {
    this.rooms.set(room.id, room);
  }

  delete(roomId: RoomId): void {
    this.rooms.delete(roomId);
  }

  list(): Room[] {
    return Array.from(this.rooms.values());
  }
}
