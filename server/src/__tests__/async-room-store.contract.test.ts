/**
 * Shared contract tests for every {@link AsyncRoomStore} implementation.
 *
 * The same suite always runs twice and optionally runs a third time:
 *
 *   1. `AsyncInMemoryRoomStore` — always runs, always wired in every CI pipe.
 *   2. `RedisRoomStore` (via `ioredis-mock`) — exercises the JSON
 *      serialization + PX TTL + SCAN listing paths against a real in-process
 *      Redis server emulation. Runs unconditionally; no external service required.
 *   3. `RedisRoomStore` (via a live Redis daemon) — enabled only when
 *      `REDIS_TEST_URL` is set, so CI can exercise the real wire protocol
 *      without forcing every local developer to run Redis all the time.
 *
 * See `docs/redis-integration-testing.md` for the CI contract and local flow.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_DECKS, DEFAULT_ROOM_SETTINGS } from "@yasp/shared";
import type { Participant, Room } from "../domain/types.js";
import { createRoomTimerState } from "../domain/timer.js";
import {
  AsyncInMemoryRoomStore,
  deserializeRoom,
  serializeRoom,
  type AsyncRoomStore,
} from "../services/async-room-store.js";
import { RedisRoomStore } from "../services/redis-room-store.js";
import { createLiveRedisHarness, hasLiveRedisTestUrl } from "./redis-test-utils.js";

function makeParticipant(overrides: Partial<Participant> = {}): Participant {
  return {
    id: "p1",
    sessionId: "s1",
    name: "Alice",
    role: "voter",
    connected: true,
    socketId: "sock-1",
    joinedAt: 1000,
    lastSeenAt: 1000,
    ...overrides,
  };
}

function makeRoom(id: string, overrides: Partial<Room> = {}): Room {
  return {
    id,
    createdAt: 1000,
    lastActivityAt: 1000,
    // Far-future expiry so Redis PX TTL never races the test.
    expiresAt: Date.now() + 60 * 60 * 1000,
    hasBeenActive: false,
    revealed: false,
    roundNumber: 1,
    currentStoryLabel: null,
    storyQueue: [],
    deck: DEFAULT_DECKS.fibonacci,
    settings: { ...DEFAULT_ROOM_SETTINGS },
    timer: createRoomTimerState(),
    moderatorId: "p1",
    previousModeratorId: null,
    participants: new Map([["s1", makeParticipant()]]),
    votes: new Map(),
    sessionRounds: [],
    ...overrides,
  };
}

type StoreFactory = () => Promise<{ store: AsyncRoomStore; teardown: () => Promise<void> }>;

function runContract(label: string, factory: StoreFactory) {
  describe(`AsyncRoomStore contract — ${label}`, () => {
    let store: AsyncRoomStore;
    let teardown: () => Promise<void>;

    beforeEach(async () => {
      const built = await factory();
      store = built.store;
      teardown = built.teardown;
    });

    afterAll(async () => {
      // Last teardown. Individual beforeEach replaces and teardown runs on
      // each iteration via the closure capture; this afterAll keeps ioredis-
      // mock from leaking handles in rare failure paths.
      if (teardown) {
        await teardown();
      }
    });

    it("save + get returns an equivalent (but not identical) room", async () => {
      const room = makeRoom("ROOMA1");
      await store.save(room);

      const got = await store.get("ROOMA1");
      expect(got).toBeDefined();
      expect(got).not.toBe(room);
      expect(got?.id).toBe("ROOMA1");
      expect(got?.participants.get("s1")?.name).toBe("Alice");
      expect(got?.votes.size).toBe(0);
      await teardown();
    });

    it("get returns undefined for a missing room", async () => {
      expect(await store.get("NOSUCH")).toBeUndefined();
      await teardown();
    });

    it("save replaces existing room state for the same id", async () => {
      await store.save(makeRoom("ROOMA1"));
      await store.save(makeRoom("ROOMA1", { revealed: true, roundNumber: 2 }));

      const got = await store.get("ROOMA1");
      expect(got?.revealed).toBe(true);
      expect(got?.roundNumber).toBe(2);
      const all = await store.list();
      expect(all).toHaveLength(1);
      await teardown();
    });

    it("delete removes the room and is idempotent", async () => {
      await store.save(makeRoom("ROOMA1"));
      await store.delete("ROOMA1");
      expect(await store.get("ROOMA1")).toBeUndefined();
      await store.delete("ROOMA1"); // idempotent
      await teardown();
    });

    it("list returns all stored rooms", async () => {
      await store.save(makeRoom("ROOMA1"));
      await store.save(
        makeRoom("ROOMB2", {
          participants: new Map([["s2", makeParticipant({ id: "p2", sessionId: "s2" })]]),
        })
      );

      const ids = (await store.list()).map((r) => r.id).sort();
      expect(ids).toEqual(["ROOMA1", "ROOMB2"]);
      await teardown();
    });

    it("Map fields round-trip with identical key/value pairs", async () => {
      const room = makeRoom("ROOMX", {
        participants: new Map([
          ["s1", makeParticipant({ id: "p1", sessionId: "s1" })],
          ["s2", makeParticipant({ id: "p2", sessionId: "s2", name: "Bob" })],
        ]),
        votes: new Map([
          ["p1", "5"],
          ["p2", "8"],
        ]),
      });
      await store.save(room);

      const got = await store.get("ROOMX");
      expect(got?.participants.size).toBe(2);
      expect(got?.participants.get("s2")?.name).toBe("Bob");
      expect(got?.votes.get("p1")).toBe("5");
      expect(got?.votes.get("p2")).toBe("8");
      await teardown();
    });

    it("mutating the returned room does not affect the stored copy", async () => {
      await store.save(makeRoom("ROOMA1"));
      const got = await store.get("ROOMA1");
      got!.participants.set("s99", makeParticipant({ id: "p99", sessionId: "s99", name: "Mallory" }));
      got!.revealed = true;

      const fresh = await store.get("ROOMA1");
      expect(fresh?.participants.has("s99")).toBe(false);
      expect(fresh?.revealed).toBe(false);
      await teardown();
    });
  });
}

// -- Implementation #1: AsyncInMemoryRoomStore -------------------------------

runContract("AsyncInMemoryRoomStore", async () => {
  return {
    store: new AsyncInMemoryRoomStore(),
    async teardown() {
      /* no-op */
    },
  };
});

// -- Implementation #2: RedisRoomStore against ioredis-mock ------------------
//
// `ioredis-mock` is an in-process emulation of Redis's TCP protocol — no
// external service, no daemon, no sockets. It implements the subset of
// commands we use here: SET, GET, DEL, PX TTL, SCAN, MGET. Running the full
// contract against it catches JSON-serialization bugs, TTL-math bugs, and
// SCAN-pagination bugs in CI.

runContract("RedisRoomStore (ioredis-mock)", async () => {
  const { default: RedisMock } = await import("ioredis-mock");
  const redis = new RedisMock();
  return {
    store: new RedisRoomStore(redis as unknown as import("ioredis").Redis),
    async teardown() {
      await redis.flushall();
      redis.disconnect();
    },
  };
});

if (hasLiveRedisTestUrl()) {
  runContract("RedisRoomStore (live Redis)", async () => {
    const harness = await createLiveRedisHarness(0);
    return {
      store: new RedisRoomStore(harness.redis),
      teardown: harness.teardown,
    };
  });
}

// -- Pure serialize/deserialize round-trip -----------------------------------

describe("serializeRoom / deserializeRoom", () => {
  it("JSON.stringify round-trip preserves Map contents", () => {
    const room = makeRoom("RT1", {
      participants: new Map([["s1", makeParticipant()]]),
      votes: new Map([["p1", "13"]]),
      currentStoryLabel: "Checkout total",
      storyQueue: [{ id: "story-1", label: "Discount code" }],
    });
    const redacted = JSON.parse(JSON.stringify(serializeRoom(room)));
    const restored = deserializeRoom(redacted);
    expect(restored.participants.get("s1")?.name).toBe("Alice");
    expect(restored.votes.get("p1")).toBe("13");
    expect(restored.currentStoryLabel).toBe("Checkout total");
    expect(restored.storyQueue).toEqual([{ id: "story-1", label: "Discount code" }]);
  });

  it("defaults agenda fields when deserializing older active room payloads", () => {
    const room = makeRoom("RT2");
    const serialized = serializeRoom(room);
    const legacyPayload = {
      ...serialized,
      currentStoryLabel: undefined,
      storyQueue: undefined,
    };

    const restored = deserializeRoom(legacyPayload as unknown as Parameters<typeof deserializeRoom>[0]);

    expect(restored.currentStoryLabel).toBeNull();
    expect(restored.storyQueue).toEqual([]);
  });
});
