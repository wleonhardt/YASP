/**
 * Shared contract tests for every {@link AsyncSessionBindingStore}
 * implementation. Runs against the in-memory adapter and the Redis prototype
 * (backed by `ioredis-mock`) so both implementations must satisfy the same
 * bind/unbind/resolve semantics without diverging. When `REDIS_TEST_URL` is
 * set, the same contract also runs against a live Redis daemon.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  AsyncInMemorySessionBindingStore,
  type AsyncSessionBindingStore,
} from "../services/async-session-binding-store.js";
import { RedisSessionBindingStore } from "../services/redis-session-binding-store.js";
import { createLiveRedisHarness, hasLiveRedisTestUrl } from "./redis-test-utils.js";

type StoreFactory = () => Promise<{
  store: AsyncSessionBindingStore;
  teardown: () => Promise<void>;
}>;

function runContract(label: string, factory: StoreFactory) {
  describe(`AsyncSessionBindingStore contract — ${label}`, () => {
    let store: AsyncSessionBindingStore;
    let teardown: () => Promise<void>;

    beforeEach(async () => {
      const built = await factory();
      store = built.store;
      teardown = built.teardown;
    });

    afterAll(async () => {
      if (teardown) await teardown();
    });

    it("resolve returns undefined for an unknown socket", async () => {
      expect(await store.resolve("sock-unknown")).toBeUndefined();
      await teardown();
    });

    it("bind + resolve round-trips the session binding", async () => {
      await store.bind("sock-1", "sess-1", "ROOM01");
      expect(await store.resolve("sock-1")).toEqual({ sessionId: "sess-1", roomId: "ROOM01" });
      await teardown();
    });

    it("bind overwrites the previous entry for the same socket", async () => {
      await store.bind("sock-1", "sess-1", "ROOM01");
      await store.bind("sock-1", "sess-2", "ROOM02");
      expect(await store.resolve("sock-1")).toEqual({ sessionId: "sess-2", roomId: "ROOM02" });
      await teardown();
    });

    it("unbind removes the entry and is idempotent", async () => {
      await store.bind("sock-1", "sess-1", "ROOM01");
      await store.unbind("sock-1");
      expect(await store.resolve("sock-1")).toBeUndefined();
      await store.unbind("sock-1"); // idempotent
      await teardown();
    });

    it("bindings are scoped per-socket", async () => {
      await store.bind("sock-1", "sess-1", "ROOMAA");
      await store.bind("sock-2", "sess-2", "ROOMBB");

      expect(await store.resolve("sock-1")).toEqual({ sessionId: "sess-1", roomId: "ROOMAA" });
      expect(await store.resolve("sock-2")).toEqual({ sessionId: "sess-2", roomId: "ROOMBB" });

      await store.unbind("sock-1");
      expect(await store.resolve("sock-1")).toBeUndefined();
      expect(await store.resolve("sock-2")).toEqual({ sessionId: "sess-2", roomId: "ROOMBB" });
      await teardown();
    });

    it("latest-tab-wins is preserved by rebinding: the newer bind wins", async () => {
      // Two tabs for the same session: the later `bind` on the new socket
      // does not clobber the older entry (they have different socket keys),
      // but the newer tab's binding is independently resolvable. Latest-tab
      // takeover is enforced at the Room level (via participant.socketId);
      // the binding store simply provides per-socket lookup.
      await store.bind("sock-old", "sess-X", "ROOMZ");
      await store.bind("sock-new", "sess-X", "ROOMZ");

      expect(await store.resolve("sock-old")).toEqual({ sessionId: "sess-X", roomId: "ROOMZ" });
      expect(await store.resolve("sock-new")).toEqual({ sessionId: "sess-X", roomId: "ROOMZ" });
      await teardown();
    });
  });
}

runContract("AsyncInMemorySessionBindingStore", async () => {
  return {
    store: new AsyncInMemorySessionBindingStore(),
    async teardown() {
      /* no-op */
    },
  };
});

runContract("RedisSessionBindingStore (ioredis-mock)", async () => {
  const { default: RedisMock } = await import("ioredis-mock");
  const redis = new RedisMock();
  return {
    store: new RedisSessionBindingStore(redis as unknown as import("ioredis").Redis),
    async teardown() {
      await redis.flushall();
      redis.disconnect();
    },
  };
});

if (hasLiveRedisTestUrl()) {
  runContract("RedisSessionBindingStore (live Redis)", async () => {
    const harness = await createLiveRedisHarness(1);
    return {
      store: new RedisSessionBindingStore(harness.redis),
      teardown: harness.teardown,
    };
  });
}
