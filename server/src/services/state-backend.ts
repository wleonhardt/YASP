import type { StateBackendConfig } from "../config.js";
import type { AsyncRoomStore } from "./async-room-store.js";
import type { AsyncSessionBindingStore } from "./async-session-binding-store.js";
import { AsyncInMemoryRoomStore } from "./async-room-store.js";
import { AsyncInMemorySessionBindingStore } from "./async-session-binding-store.js";
import { logger } from "../utils/logger.js";

/**
 * Bundle of async stores returned by the state-backend factory. Phase 2
 * prototypes — the composition root currently instantiates the legacy
 * synchronous in-memory stores for `memory` mode to preserve behavior.
 * `redis` mode constructs and returns the Redis prototypes here but does NOT
 * yet re-plumb RoomService onto the async interface — see ADR 0002.
 */
export interface AsyncStateBackend {
  readonly kind: "memory" | "redis";
  readonly roomStore: AsyncRoomStore;
  readonly sessionBindingStore: AsyncSessionBindingStore;
  /**
   * Release any backend-owned resources (Redis connections, sockets, etc.).
   * Called from the process shutdown path.
   */
  close(): Promise<void>;
}

/**
 * Construct the Phase 2 async stores from a resolved config. For `memory`
 * this is a cheap, always-synchronous wrap. For `redis` this dynamically
 * imports `ioredis`, opens a connection, runs a PING health check, and wires
 * the Redis prototypes. A failed PING throws — startup should fail loudly.
 */
export async function createAsyncStateBackend(
  config: StateBackendConfig
): Promise<AsyncStateBackend> {
  if (config.kind === "memory") {
    return {
      kind: "memory",
      roomStore: new AsyncInMemoryRoomStore(),
      sessionBindingStore: new AsyncInMemorySessionBindingStore(),
      async close() {
        /* no-op */
      },
    };
  }

  // Dynamic import so local dev / tests never pay for `ioredis` unless the
  // Redis backend is actually requested.
  const { default: IORedis } = await import("ioredis");
  const { RedisRoomStore } = await import("./redis-room-store.js");
  const { RedisSessionBindingStore } = await import("./redis-session-binding-store.js");

  const redis = new IORedis(config.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    // Phase 2 prototype: fail loudly on startup rather than silently queueing
    // commands while the connection flaps.
    enableOfflineQueue: false,
  });

  try {
    await redis.connect();
    const pong = await redis.ping();
    if (pong !== "PONG") {
      throw new Error(`Unexpected Redis PING response: ${JSON.stringify(pong)}`);
    }
    logger.info("Redis state backend connected", { url: redactRedisUrl(config.redisUrl) });
  } catch (error) {
    // Tear down the half-open client so the process can exit cleanly.
    try {
      redis.disconnect();
    } catch {
      /* ignore */
    }
    throw new Error(
      `Failed to connect to Redis at ${redactRedisUrl(config.redisUrl)}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  return {
    kind: "redis",
    roomStore: new RedisRoomStore(redis),
    sessionBindingStore: new RedisSessionBindingStore(redis),
    async close() {
      try {
        await redis.quit();
      } catch {
        redis.disconnect();
      }
    },
  };
}

/**
 * Strip any inline credentials before logging a Redis URL. The URL is logged
 * at startup and on connection failures; it must never leak
 * `redis://user:password@host` into CloudWatch.
 */
function redactRedisUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    if (parsed.username || parsed.password) {
      parsed.username = parsed.username ? "***" : "";
      parsed.password = parsed.password ? "***" : "";
    }
    return parsed.toString();
  } catch {
    return "[unparseable-redis-url]";
  }
}
