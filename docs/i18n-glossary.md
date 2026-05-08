# YASP Localization Glossary

```
  ┌────────────────────────────────────────────────────────────────┐
  │  🌍  YASP ships in 9 languages. Thanks for helping keep them  │
  │      accurate.  This file is your source of truth.            │
  └────────────────────────────────────────────────────────────────┘
```

---

## Supported Locales

| Flag | Code | Language |
|---|---|---|
| 🇺🇸 | `en` | English ← **source locale** |
| 🇪🇸 | `es` | Spanish |
| 🇫🇷 | `fr` | French |
| 🇩🇪 | `de` | German |
| 🇧🇷 | `pt` | Portuguese |
| 🇯🇵 | `ja` | Japanese |
| 🇰🇷 | `ko` | Korean |
| 🇨🇳 | `zh-Hans` | Simplified Chinese |
| 🇹🇼 | `zh-Hant` | Traditional Chinese |

Locale files live under `client/src/i18n/locales/`.

---

## Workflow

```
  1.  Edit the target locale file  (e.g. fr.json)
  2.  Keep every key that exists in  en.json
      — extra keys are silently ignored
      — missing keys fail CI
  3.  Keep placeholder shapes identical:
        {{count}}  in English  →  {{count}}  in your translation
  4.  Run  npm run i18n:check  to verify before committing
  5.  If a term changes product-wide, update this glossary
      in the same pull request
```

English (`en`) is the source and fallback. If a string is missing from
another locale, the app falls back to English automatically.

---

## Product Term Glossary

These terms have specific product meanings. Keep them stable across all
locales and pull requests. When in doubt about what a term means, check
the definition here rather than the surrounding UI copy.

| Term | Definition |
|---|---|
| **host** / **moderator** | The room facilitator. Can reveal votes, reset rounds, advance to next round, and transfer host to another participant. Not a server administrator. |
| **room** | A planning poker session. Rooms are ephemeral — they exist only while participants are connected. |
| **reveal** | The action that shows hidden votes to all participants simultaneously. |
| **spectator** | An observer who can watch the room but cannot cast votes. |
| **voter** | A participant who can select and cast a card. |
| **custom deck** | A user-configured set of planning cards for a specific room. |
| **coffee card** | The special break/pause card. Stored internally as the coffee token. |
| **round** | One voting cycle inside a room. Starts when reset, ends when revealed. |
| **session replaced** | This browser tab lost control because the same room/session became active in another tab (latest-tab-wins behavior). |

---

## Placeholder Reference

Placeholders follow `{{name}}` syntax and must be preserved exactly.

| Placeholder | Meaning |
|---|---|
| `{{name}}` | A participant's display name |
| `{{count}}` | A numeric count (votes, participants, etc.) |
| `{{roomId}}` | A room identifier |

Do not translate, reorder, or rephrase placeholder tokens.

---

## CI Enforcement

`npm run i18n:check` runs in CI on every PR. It validates:

- Key parity — every key in `en.json` must exist in every other locale
- Placeholder usage — `{{...}}` tokens in source must appear in translations

A missing key or broken placeholder will fail the build.
