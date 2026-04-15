import type { Redis } from "ioredis";

const BASE_REDIS_TEST_URL = process.env.REDIS_TEST_URL?.trim() ?? "";

export function hasLiveRedisTestUrl(): boolean {
  return BASE_REDIS_TEST_URL.length > 0;
}

export function getLiveRedisTestUrl(dbOffset: number): string | null {
  if (!hasLiveRedisTestUrl()) return null;

  const parsed = new URL(BASE_REDIS_TEST_URL);
  const rawDb = parsed.pathname.length > 1 ? parsed.pathname.slice(1) : "0";
  const baseDb = Number.parseInt(rawDb, 10);

  if (!Number.isFinite(baseDb) || baseDb < 0) {
    throw new Error(
      `REDIS_TEST_URL must include a non-negative numeric DB path: ${JSON.stringify(BASE_REDIS_TEST_URL)}`
    );
  }

  parsed.pathname = `/${baseDb + dbOffset}`;
  return parsed.toString();
}

export async function createLiveRedisHarness(dbOffset: number): Promise<{
  redis: Redis;
  redisUrl: string;
  teardown: () => Promise<void>;
}> {
  const redisUrl = getLiveRedisTestUrl(dbOffset);
  if (!redisUrl) {
    throw new Error("REDIS_TEST_URL is not set");
  }

  const { default: IORedis } = await import("ioredis");
  const redis = new IORedis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });

  await redis.connect();
  await redis.flushdb();

  return {
    redis,
    redisUrl,
    async teardown() {
      try {
        await redis.flushdb();
        await redis.quit();
      } catch {
        redis.disconnect();
      }
    },
  };
}

export async function resetLiveRedisDb(dbOffset: number): Promise<void> {
  const harness = await createLiveRedisHarness(dbOffset);
  await harness.teardown();
}
