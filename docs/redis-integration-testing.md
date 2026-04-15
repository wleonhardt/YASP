# Redis Integration Testing Plan

Phase 2 ships `RedisRoomStore` and `RedisSessionBindingStore` as prototypes
behind `YASP_STATE_BACKEND=redis`. This document is the plan for how the
contract tests cover them today and how live-Redis coverage should be added
later.

## What runs in CI today

Both contract test suites run against two backends on every CI invocation:

1. The in-memory adapter (`AsyncInMemoryRoomStore`,
   `AsyncInMemorySessionBindingStore`).
2. The Redis implementation driven by **`ioredis-mock`**, an in-process
   emulation of the Redis wire protocol.

`ioredis-mock` implements the subset of commands the prototypes use: `SET`
with `PX`, `GET`, `DEL`, `SCAN`, `MGET`, `PING`, `QUIT`. No external service
is required, so CI time is unchanged and the test matrix does not grow.

### What the mock-backed run catches

- JSON serialization / deserialization drift between Redis and in-memory
  modes (e.g. `Map` → array-of-tuples round-trip)
- Wrong argument order or missing flags in `SET ... PX ...`
- Broken `SCAN` pagination (cursor loop, COUNT clamping, empty batches)
- `MGET` behavior on a mix of present and absent keys
- Idempotency (`DEL` of a missing key, repeated `bind` for the same socket)

### What the mock-backed run does NOT catch

- Actual wire-protocol encoding (`ioredis-mock` is in-process)
- Cluster-mode routing, hash-slot key constraints, `CROSSSLOT` errors
- Real network partitions / connection resets during a request
- Eviction behavior under `maxmemory` + `volatile-ttl` policies
- Redis-version-specific command semantics
- Connection pooling / backpressure under load
- Lua script atomicity (none are used today — but a future CAS step will need
  live-server coverage)

## Why live-Redis tests are not yet practical

- YASP's CI runners do not have a managed Redis service attached. Adding one
  requires infra changes outside Phase 2 scope.
- Running Redis locally during `npm test` couples developer onboarding to a
  daemon and a port.
- Until Phase 3 actually wires RoomService onto the async interface, live
  Redis coverage gives us no new signal versus the mock — the code path that
  _would_ hit real Redis at runtime (RoomService → AsyncRoomStore →
  RedisRoomStore) does not exist yet in the composition root.

## Plan for Phase 3 (when RoomService goes async)

1. Add a `REDIS_TEST_URL` env var. When set, run the existing contract suites
   a _third_ time pointing at a real Redis instance. Skip cleanly when unset.
2. In CI, provision a sidecar Redis container via the repo's GitHub Actions
   workflow (e.g. `services: redis: image: redis:7-alpine`) and set
   `REDIS_TEST_URL=redis://localhost:6379/0` on the `test` job.
3. Add a dedicated `redis-cluster.contract.test.ts` that exercises hash-slot
   correctness by using `{room-tag}` hash-tags inside the key template when
   cluster mode is detected.
4. Add a `redis-failure-injection.test.ts` using toxiproxy or `iptables`
   rules in CI to simulate resets mid-request and assert the store returns
   a clean error rather than hanging.

## How to run the mock-backed contract suite locally

`npm test` already runs it. To run the two contract files in isolation:

```
npm test -w server -- async-room-store.contract async-session-binding-store.contract
```

## How to run against a real local Redis (Phase 3 preview)

Today, nothing in the codebase reads `REDIS_TEST_URL`. Once Phase 3 lands
and RoomService is wired through the async interface, the contract tests
will add a third `runContract(...)` call guarded by `REDIS_TEST_URL`. Local
flow will be:

```
docker run --rm -p 6379:6379 redis:7-alpine
REDIS_TEST_URL=redis://localhost:6379/0 npm test -w server
```

## Non-Goals

Per ADR 0002, Phase 2 does not introduce:

- Live Redis in CI
- Multi-instance failure tests
- Benchmarks of Redis vs in-memory paths
- A Socket.IO Redis adapter or its tests

Those arrive with Phase 3 and later.
