# Open Questions

## Open

- 2026-04-14: In future Redis mode, should room updates use optimistic compare-and-set semantics or a single coordinator pattern to avoid lost writes across instances? (Phase 2 `RedisRoomStore` uses plain `SET` — last writer wins. Revisit when Phase 3 wires `RoomService` onto async stores.)
- 2026-04-14: In future Redis mode, which process should own timer completion and cleanup so only one instance applies auto-reveal, room expiry, and stale-participant removal?
- 2026-04-14: Should the Redis key TTL grace (`ROOM_KEY_TTL_GRACE_MS = 60s` above `room.expiresAt`) be aligned with or driven by `CLEANUP_INTERVAL_MS`? Currently they are independent; works in practice but worth revisiting alongside cleanup ownership.

## Resolved

<!-- Move answered questions here with a brief resolution note. -->
