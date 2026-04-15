import type { RoomId } from "@yasp/shared";
import type { Room } from "../domain/types.js";
import { InMemoryRoomStore, type RoomStore } from "./room-store.js";

/**
 * Async version of {@link RoomStore} for Phase 2 optional horizontal scaling.
 *
 * All implementations — including the in-memory wrapper — return promises so
 * that callers written against this interface can transparently target either
 * the in-memory prototype or the Redis prototype (see `RedisRoomStore`).
 *
 * Semantics (must be preserved by every implementation):
 *
 *  - `get(roomId)` returns the current active room or `undefined`. Every call
 *    must return a fresh Room object (no shared references). Implementations
 *    that keep their source of truth in memory must therefore deep-clone
 *    before returning; Redis implementations deserialize fresh each time.
 *
 *  - `save(room)` replaces the stored room for `room.id`. If `room.expiresAt`
 *    is in the future, the implementation should set a key-level TTL so
 *    forgotten rooms don't linger in the store when no cleanup coordinator is
 *    alive.
 *
 *  - `delete(roomId)` removes the room if present. Idempotent.
 *
 *  - `list()` returns a snapshot of currently stored rooms. Used by cleanup
 *    and per-session moderator caps. Snapshot semantics — ordering and
 *    concurrency under mutation are best-effort.
 *
 * Ephemeral-only: implementations MUST NOT persist any historical, replay, or
 * audit data. Redis mode exists solely to share active state across instances.
 */
export interface AsyncRoomStore {
  get(roomId: RoomId): Promise<Room | undefined>;
  save(room: Room): Promise<void>;
  delete(roomId: RoomId): Promise<void>;
  list(): Promise<Room[]>;
}

/**
 * Async adapter over the existing sync {@link InMemoryRoomStore}. Deep-clones
 * on every read/write boundary so callers that later target Redis can rely on
 * reference-fresh Rooms uniformly.
 */
export class AsyncInMemoryRoomStore implements AsyncRoomStore {
  private readonly inner: RoomStore;

  constructor(inner: RoomStore = new InMemoryRoomStore()) {
    this.inner = inner;
  }

  async get(roomId: RoomId): Promise<Room | undefined> {
    const room = this.inner.get(roomId);
    return room ? cloneRoom(room) : undefined;
  }

  async save(room: Room): Promise<void> {
    this.inner.save(cloneRoom(room));
  }

  async delete(roomId: RoomId): Promise<void> {
    this.inner.delete(roomId);
  }

  async list(): Promise<Room[]> {
    return this.inner.list().map(cloneRoom);
  }
}

/**
 * JSON-serializable Room shape. Maps are represented as arrays of `[key,
 * value]` tuples — JSON has no native Map support, and this preserves the
 * exact key identity we use (SessionId for participants, ParticipantId for
 * votes) without relying on key-order heuristics.
 */
export type SerializedRoom = Omit<Room, "participants" | "votes"> & {
  participants: Array<[string, Room["participants"] extends Map<string, infer V> ? V : never]>;
  votes: Array<[string, Room["votes"] extends Map<string, infer V> ? V : never]>;
};

export function serializeRoom(room: Room): SerializedRoom {
  return {
    ...room,
    participants: Array.from(room.participants.entries()),
    votes: Array.from(room.votes.entries()),
  };
}

export function deserializeRoom(sr: SerializedRoom): Room {
  return {
    ...sr,
    participants: new Map(sr.participants),
    votes: new Map(sr.votes),
  };
}

function cloneRoom(room: Room): Room {
  // The serialized shape is an exact structural round-trip — the only
  // non-trivial fields are the two Maps, which serialize/deserialize rebuild.
  // structuredClone would also work but is slightly more expensive and would
  // not exercise the same code path the Redis implementation uses.
  return deserializeRoom(serializeRoom(room));
}
