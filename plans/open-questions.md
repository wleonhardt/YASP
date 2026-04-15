# Open Questions

## Open

- 2026-04-14: In future multi-instance Redis mode, should room updates use
  optimistic compare-and-set semantics or a single coordinator pattern to
  avoid lost writes across instances? Phase 3 serializes writes only inside a
  single process via `AsyncOperationQueue`; cross-instance coordination is
  still undecided.
- 2026-04-14: In future multi-instance Redis mode, which process should own
  timer completion and cleanup so only one instance applies auto-reveal, room
  expiry, and stale-participant removal?
- 2026-04-15: Should the AWS/CDK deployment path remain intentionally
  memory-only, or should it grow first-class `YASP_STATE_BACKEND=redis` /
  `REDIS_URL` support for the TTL-bound Redis active-state profile? The current
  userdata/systemd bootstrap deploys the default memory profile only.

## Resolved

- 2026-04-15: Redis key TTL grace now tracks the cleanup cadence instead of a
  fixed 60s buffer. `RedisRoomStore` sets room-key TTL to
  `room.expiresAt - now + CLEANUP_INTERVAL_MS + 5s`, which keeps the active
  room available long enough for cleanup to observe and remove it coherently.
