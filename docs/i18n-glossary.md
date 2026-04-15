# YASP Localization Glossary

Use this file as the lightweight source of truth for localization reviews.

Current workflow:

- English (`en`) is the source locale.
- Supported locales are `en`, `es`, `fr`, `de`, `pt`, `ja`, `ko`, `zh-Hans`,
  and `zh-Hant`.
- Locale files live under `client/src/i18n/locales/`.
- `npm run i18n:check` validates key parity and placeholder usage and runs in
  CI.

Review/update workflow:

1. Add or edit English source strings first.
2. Propagate the same key set and placeholder shape to every supported locale.
3. Keep glossary terms stable unless a product-language change is intentional.
4. Run `npm run i18n:check` before merging.
5. If a term changes product-wide, update this glossary in the same pull
   request so reviewers have a single source of truth.

When adding or reviewing translations, keep the following product terms stable
across pull requests:

- **host**: the room moderator or facilitator, not a server host
- **moderator**: the participant who can reveal, reset, advance rounds, and transfer host
- **room**: a planning poker session
- **reveal**: show hidden votes to the room
- **spectator**: an observer who cannot vote
- **voter**: a participant who can choose a card
- **custom deck**: a user-configured set of planning cards for a room
- **coffee card**: the special break card represented in storage by the coffee token
- **round**: the current voting cycle inside a room
- **session replaced**: this browser tab lost control because the same room/session became active in another tab
