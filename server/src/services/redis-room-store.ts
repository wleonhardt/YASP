import type { Redis } from "ioredis";
import type { RoomId } from "@yasp/shared";
import type { Room } from "../domain/types.js";
import {
  deserializeRoom,
  serializeRoom,
  type AsyncRoomStore,
  type SerializedRoom,
} from "./async-room-store.js";
import { now } from "../utils/time.js";
import { CLEANUP_INTERVAL_MS } from "../config.js";

/**
 * Redis key namespace for active rooms. One JSON-encoded room per key.
 *
 * Ephemeral only: we rely on Redis key TTL so an instance dying before
 * broadcasting delete() still drops the room eventually. There is no
 * yasp:room:history, yasp:room:archive, or any other durable key — Redis is
 * used purely as distributed in-memory state for the active room set.
 */
export const REDIS_ROOM_KEY_PREFIX = "yasp:room:";

/**
 * Extra margin added to a key's TTL beyond the room's own `expiresAt`. Gives
 * an in-process cleanup coordinator (when Phase 3 adds one) time to observe
 * the expiry and broadcast a final `room_closed` to any still-connected
 * clients before the key is reaped by Redis itself.
 */
const ROOM_KEY_TTL_GRACE_MS = CLEANUP_INTERVAL_MS + 5_000;

/**
 * Minimum key TTL. Guards against pathological cases where a just-saved room
 * has an `expiresAt` already in the past (e.g. clock skew, manual expiry
 * updates). A 5s floor keeps the key around long enough for the CAS reader
 * that prompted the save to observe it.
 */
const MIN_ROOM_KEY_TTL_MS = 5_000;

/**
 * Cap on the number of keys scanned per `SCAN` round-trip. Rooms are
 * expected to be in the hundreds at most; a 200-key COUNT keeps each RTT
 * bounded without excessive pipelining.
 */
const SCAN_COUNT = 200;

/**
 * Redis-backed {@link AsyncRoomStore}. Prototype — see ADR 0002 for scope.
 *
 * Serialization: rooms are JSON-encoded via {@link serializeRoom}. Maps
 * round-trip as arrays of tuples. No bespoke binary format.
 *
 * TTL: every `save` resets the key TTL so a stored room outlives
 * `room.expiresAt` by {@link ROOM_KEY_TTL_GRACE_MS}. If a room is abandoned
 * entirely (every app instance forgets about it), Redis still evicts it.
 *
 * Write coordination: single-key `SET key value PX ttl` — atomic, but NOT
 * compare-and-set. Concurrent writers from two instances can lose updates.
 * That is a known limitation for Phase 2 and is tracked in
 * `plans/open-questions.md`.
 */
export class RedisRoomStore implements AsyncRoomStore {
  constructor(private readonly redis: Redis) {}

  async get(roomId: RoomId): Promise<Room | undefined> {
    const raw = await this.redis.get(keyFor(roomId));
    if (!raw) return undefined;
    return deserializeRoom(JSON.parse(raw) as SerializedRoom);
  }

  async save(room: Room): Promise<void> {
    const key = keyFor(room.id);
    const payload = JSON.stringify(serializeRoom(room));
    const ttlMs = Math.max(
      MIN_ROOM_KEY_TTL_MS,
      room.expiresAt - now() + ROOM_KEY_TTL_GRACE_MS
    );
    await this.redis.set(key, payload, "PX", ttlMs);
  }

  async delete(roomId: RoomId): Promise<void> {
    await this.redis.del(keyFor(roomId));
  }

  async list(): Promise<Room[]> {
    const rooms: Room[] = [];
    let cursor = "0";
    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        "MATCH",
        `${REDIS_ROOM_KEY_PREFIX}*`,
        "COUNT",
        SCAN_COUNT
      );
      cursor = nextCursor;
      if (keys.length === 0) continue;

      const values = await this.redis.mget(...keys);
      for (const raw of values) {
        if (!raw) continue;
        try {
          rooms.push(deserializeRoom(JSON.parse(raw) as SerializedRoom));
        } catch {
          // Corrupted entry — skip. Redis is used as ephemeral shared state;
          // a single unparseable value must not take down a listing.
        }
      }
    } while (cursor !== "0");
    return rooms;
  }
}

function keyFor(roomId: RoomId): string {
  return `${REDIS_ROOM_KEY_PREFIX}${roomId}`;
}
