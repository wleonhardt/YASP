import type { Redis } from "ioredis";
import type { RoomId, SessionId, SocketId } from "@yasp/shared";
import type { AsyncSessionBindingStore, SessionBinding } from "./async-session-binding-store.js";

/**
 * Redis key namespace for active socket → session-binding entries. One
 * JSON-encoded `SessionBinding` per key. Key is `yasp:session:{socketId}` —
 * the socketId is the natural primary key because all lookups are by socket.
 *
 * Ephemeral only: bindings have a 24h hard TTL (`BINDING_TTL_MS`) so entries
 * that escape `unbind` (process crash, kill -9) cannot accumulate.
 */
export const REDIS_SESSION_KEY_PREFIX = "yasp:session:";

/**
 * Hard TTL applied to every binding. Much longer than any honest session —
 * real sessions `unbind` on disconnect. Acts purely as a crash-safety net.
 */
const BINDING_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Redis-backed {@link AsyncSessionBindingStore}. Prototype — see ADR 0002.
 *
 * Latest-tab-wins semantics: this store does NOT enforce latest-tab-wins; it
 * is enforced in the Room (via `participant.socketId`). The binding store is
 * a simple per-socket lookup, identical in shape to the in-memory prototype.
 * Preserving that contract is why both implementations share the same
 * interface-level tests.
 */
export class RedisSessionBindingStore implements AsyncSessionBindingStore {
  constructor(private readonly redis: Redis) {}

  async bind(socketId: SocketId, sessionId: SessionId, roomId: RoomId): Promise<void> {
    const binding: SessionBinding = { sessionId, roomId };
    await this.redis.set(keyFor(socketId), JSON.stringify(binding), "PX", BINDING_TTL_MS);
  }

  async unbind(socketId: SocketId): Promise<void> {
    await this.redis.del(keyFor(socketId));
  }

  async resolve(socketId: SocketId): Promise<SessionBinding | undefined> {
    const raw = await this.redis.get(keyFor(socketId));
    if (!raw) return undefined;
    try {
      const parsed = JSON.parse(raw) as SessionBinding;
      if (typeof parsed?.sessionId !== "string" || typeof parsed?.roomId !== "string") {
        return undefined;
      }
      return parsed;
    } catch {
      return undefined;
    }
  }
}

function keyFor(socketId: SocketId): string {
  return `${REDIS_SESSION_KEY_PREFIX}${socketId}`;
}
