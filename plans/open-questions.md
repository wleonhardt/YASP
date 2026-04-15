# Open Questions

## Open

- 2026-04-14: In future Redis mode, should room updates use optimistic compare-and-set semantics or a single coordinator pattern to avoid lost writes across instances?
- 2026-04-14: In future Redis mode, which process should own timer completion and cleanup so only one instance applies auto-reveal, room expiry, and stale-participant removal?

## Resolved

<!-- Move answered questions here with a brief resolution note. -->
