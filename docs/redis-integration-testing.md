# Redis Integration Testing

Phase 3 keeps the fast mock-backed coverage from Phase 2 and adds live Redis
coverage for both the store contracts and the real Redis-backed server runtime.

## What runs in CI today

Store contract coverage runs against three backends in CI:

1. The in-memory adapter (`AsyncInMemoryRoomStore`,
   `AsyncInMemorySessionBindingStore`).
2. The Redis implementation driven by **`ioredis-mock`**, an in-process
   emulation of the Redis wire protocol.
3. The Redis implementation driven by a real Redis service container when
   `REDIS_TEST_URL` is set (CI sets it by default).

Runtime integration coverage also runs against a real Redis instance:

- `redis-runtime.integration.test.ts` boots the real server runtime with
  `YASP_STATE_BACKEND=redis` semantics through `createServerRuntime(...)`
  and uses Socket.IO clients against a live Redis-backed state path.

`ioredis-mock` still provides fast contract feedback locally. The live Redis
layer proves the real Redis client, key TTL behavior, and runtime wiring.

### What the mock-backed run catches

- JSON serialization / deserialization drift between Redis and in-memory
  modes (e.g. `Map` → array-of-tuples round-trip)
- Wrong argument order or missing flags in `SET ... PX ...`
- Broken `SCAN` pagination (cursor loop, COUNT clamping, empty batches)
- `MGET` behavior on a mix of present and absent keys
- Idempotency (`DEL` of a missing key, repeated `bind` for the same socket)

### What the live Redis run adds

- Real `ioredis` connection and command execution
- Actual Redis TTL expiration semantics
- Runtime composition correctness (`createServerRuntime` → async adapters →
  Redis stores)
- Socket-level semantics for:
  - create / join / reconnect
  - latest-tab-wins
  - vote / reveal / reset / next round
  - moderator transfer
  - settings persistence within room lifetime
  - cleanup / expiry behavior

## CI Configuration

The `validate` job provisions a Redis sidecar:

- image: `redis:7-alpine`
- base test URL: `REDIS_TEST_URL=redis://127.0.0.1:6379/10`

The helper layer offsets DB numbers per suite so contract and runtime tests do
not share keys:

- room store contracts: base DB + 0
- session-binding contracts: base DB + 1
- runtime integration tests: base DB + 2

When `REDIS_TEST_URL` is unset, the live Redis suites skip cleanly.

## How to run the mock-backed contract suite locally

`npm test` already runs it. To run the two contract files in isolation:

```
npm test -w server -- async-room-store.contract async-session-binding-store.contract
```

## How to run against a real local Redis locally

Start Redis:

```
docker run --rm -p 6379:6379 redis:7-alpine
```

Then run the server test suite with live Redis enabled:

```
REDIS_TEST_URL=redis://localhost:6379/0 npm test -w server
```

That will run:

- the in-memory contract suites
- the `ioredis-mock` contract suites
- the live Redis contract suites
- the live Redis runtime integration suite

## Non-Goals

Phase 3 coverage still does not introduce:

- Redis Cluster / hash-slot tests
- Multi-instance failure or partition-injection tests
- Benchmarks of Redis vs in-memory paths
- A Socket.IO Redis adapter or its tests

Those remain future work.
