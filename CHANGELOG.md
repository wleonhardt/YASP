# Changelog

All notable changes to YASP are documented in this file.

## [1.0.0] - 2026-05-08

Initial public release of YASP (Yet Another Scrum Poker).

### Features

- Real-time planning poker via WebSockets
- Multiple deck presets (Fibonacci, T-shirt sizes, powers of two) plus custom decks
- Moderator controls: reveal, reset, next round, timer
- Shared round timer with presets, pause, and auto-reveal
- Spectator mode (join without voting)
- Reconnect-friendly — rejoin mid-session without losing state
- Moderator transfer and automatic handoff on disconnect
- Round results with average, median, mode, spread, and consensus indicator
- Story agenda queue: add, reorder, and bulk-import stories
- Session report with per-round history and story labels
- Localised in 9 languages (English, French, German, Spanish, Japanese,
  Chinese Simplified, Brazilian Portuguese, Russian, Swahili)
- Keyboard-navigable UI with live-region announcements (WCAG 2.1 AA)
- Self-hosted via Docker — no database, no Redis, no external services
- MIT licence

[1.0.0]: https://github.com/wleonhardt/YASP/releases/tag/v1.0.0
