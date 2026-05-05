# UI Upgrade Plan

Status: `proposed`
Date: 2026-05-04

A staged plan to rework the room UI hierarchy so the *current action* is the
visual centerpiece, moderator chrome recedes, and the topbar carries identity
only. Driven by a hands-on review of the live app — see the "Findings" section
for the audit that motivated each change.

---

## Goals

1. Make the **current phase action** (vote, then reveal/next round) the
   unmistakable focus of the screen.
2. Demote moderator configuration to a drawer/popover — most rounds nobody
   touches it.
3. Free the topbar to do one job: identity + utilities.
4. Improve scan-ability of results (chart shape, stat strip, hierarchy).
5. Keep every change small, observable in the preview, and behind a single
   commit so we can revert a step without unwinding the whole plan.

## Non-goals

- No new dependencies (no chart library, no animation library).
- No copy/i18n rewrites beyond keys we add.
- No backend or shared-package changes.
- No theming overhaul — the existing CSS variables stay.

---

## Findings (audit summary)

Captured 2026-05-04 against `main` at HEAD. Layout grid is
`1.55fr | 0.92fr` (ParticipantsBoard left, VoteDeck/Results right).
Moderator panel is full-width and 381px tall on desktop.

| # | Finding | Why it matters |
|---|---|---|
| F1 | VoteDeck/Results are in a 420px sidebar; Participants get the wide column | The deck is *the* primary action — should be centerpiece |
| F2 | ModeratorControls panel is 381px tall and bundles timer, settings, sound, transfer host, AND the phase action button | Visual weight far exceeds usage frequency |
| F3 | Phase action button (Reveal / Next round) lives inside ModeratorControls, floating right of the timer | Action button should be attached to the stage, not the meta panel |
| F4 | "Sound on" lives in the moderator timer row | It's a per-user preference, not a moderator action |
| F5 | TopBar 3-col grid mixes identity (room code) with session status (Round 1, voted progress) with utilities (leave, connection) | Three unrelated jobs in one strip |
| F6 | Room code `PMRRRB` is a small pill in the topbar corner | The single most important affordance for inviting people is hidden |
| F7 | Distribution chart is horizontal rows sorted by count | Wrong shape; vote distribution wants a column chart in card order |
| F8 | Stat tiles use 2×2 grid; padded boxes around single numbers | Wastes space at every breakpoint |
| F9 | Every panel uses identical `--color-surface` + 1px border | No anchor — eye has nothing to follow |
| F10 | Section eyebrows (`LIVE BOARD`, `KEY STATS`, `RESULTS`, `TIMER & PACING`) on every panel | Adds vertical weight without payoff when the heading already says it |
| F11 | Sparse states (1 participant) feel busy: avatar dot + card + "Not voted" badge + `—` placeholder | Empty room should be a friendly invite hero, not skeleton chrome |
| F12 | Duration `m`/`s` labels sit outside the inputs | Easy to lose; grouped field would be cleaner |
| F13 | Start / Reset / Beep buttons are equal visual weight | Start should be primary, others ghost |
| F14 | `Round 1` heading appears in topbar AND is implied by panel content | Duplicated semantics |
| F15 | `participants-board__progress` and `room-status__progress` use slightly different styling | Small consistency leak |

### Vercel Web Interface Guidelines compliance audit

Reviewed 2026-05-04 against
`https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`.

| # | Finding | Why it matters |
|---|---|---|
| G1 | `.language-switcher__select:focus-visible { outline: none }` (globals.css:1165) — no replacement focus indicator on parent `.language-switcher` | Keyboard users lose focus visibility on language picker |
| G2 | No `color-scheme: dark` on `<html>` (or in CSS) | Native UI (scrollbars, form widgets, esp. Windows dark mode) won't pick the dark variant |
| G3 | No skip-link to `<main>`; sr-only h1 in `RoomPage` is not a skip target | Keyboard/screen-reader users tab through topbar every nav |
| G4 | Timer status chip (`RoomTimer.tsx:432`) lacks `aria-live` | running→complete transition silent for screen readers |
| G5 | Consensus chip (`ResultsPanel.tsx:202-208`) lacks `role="status"`/`aria-live` | "Consensus reached" not announced post-reveal |
| G6 | Deck tokens (`DeckToken` in `ResultsPanel.tsx:69,289` + `VoteDeck.tsx:91`) missing `translate="no"` | Auto-translate may garble `?`, `☕`, numerals |
| G7 | `voted/total` count in `ParticipantsBoard.tsx:50-54` not wrapped in `tabular-nums` | Numbers visibly jump as votes update |
| G8 | Duration inputs (`RoomTimer.tsx:451,471`) lack `inputMode="numeric"` and `autocomplete="off"` | Mobile shows full keyboard; password manager may suggest values |
| G9 | Number inputs respond to scroll-wheel when focused | Accidental value mutation; consider `onWheel={e=>e.currentTarget.blur()}` |
| G10 | "Hide/Show roster" toggle in `ParticipantsBoard.tsx:100` rendered at all widths | Redundant chrome on desktop |
| G11 | No `touch-action: manipulation` on interactive elements | 300ms double-tap delay on iOS Safari |
| G12 | No `-webkit-tap-highlight-color` set | Default blue flash on tap (mobile) |
| G13 | No `overscroll-behavior: contain` on modal/drawer surfaces (`RoundReportModal`, `SessionReportModal`) | Body scroll-bleed when scrolling inside modal |
| G14 | `prefers-reduced-motion` block (globals.css:3464) only handles `animation-*`, not `transition-*` properties | `transition: width …slow…` on progress fills still runs |
| G15 | TopBar leave button (`TopBar.tsx:35`) has both visible label and `aria-label="Leave room"` (duplicate accessible name) | Minor a11y noise; prefer `title` only when label visible |
| G16 | Vote card (`VoteDeck.tsx:75-93`) lacks `aria-describedby` linking to the keyboard shortcut hint | Hint exists but isn't programmatically associated |

---

## Phases

Each phase is a single commit (or small ordered series) that leaves the app in
a working, shippable state. Stop after any phase if priorities shift.

### Phase 1 — Quick wins (low risk, high clarity)

Cluster of small CSS/JSX changes that don't move components, just reduce
noise and fix weight.

- **P1.1 Move Sound toggle to TopBar utility menu.** Addresses F4. Render the
  existing `SoundOnIcon`/`SoundOffIcon` button in `RoomUtilityMenu.tsx`
  alongside Theme/Language. Keep the audio-priming behaviour (it just runs
  from a different mount point). Remove from `RoomTimer.tsx`.
  - *Files*: `RoomUtilityMenu.tsx`, `RoomTimer.tsx`, `globals.css` (drop
    `.room-timer__sound-toggle`).
  - *Verify*: sound preference persists to `localStorage`, beep still fires.

- **P1.2 Demote redundant section eyebrows.** Addresses F10. Remove the
  uppercase eyebrow on panels whose `<h2>` already names the panel:
  `Participants`, `Revealed votes`. Keep eyebrows on sub-sections inside
  larger panels (`KEY STATS` under Results stays).
  - *Files*: `ParticipantsBoard.tsx`, `ResultsPanel.tsx`.

- **P1.3 De-emphasise Reset/Beep buttons.** Addresses F13. `Start` becomes
  `button--primary` (or keep secondary but visually heavier), `Reset` and
  `Beep` collapse to `button--ghost` with smaller padding.
  - *Files*: `RoomTimer.tsx`.

- **P1.4 Wrap duration inputs.** Addresses F12. Move `m`/`s` labels inside
  a single bordered field with the two number inputs so they read as one
  control.
  - *Files*: `RoomTimer.tsx`, `globals.css` (`.room-timer__duration-*`).

- **P1.5 Drop centered Round heading from TopBar.** Addresses F5/F14. Remove
  the center column of the topbar grid; let the round/voted progress live
  inside the participants panel header (or the deck panel eyebrow if F2 is
  done first). TopBar becomes 2-col: room code (left) | utilities (right).
  - *Files*: `TopBar.tsx`, `globals.css` (`.topbar`,
    `grid-template-columns`).

**Exit criteria for Phase 1**: every panel lighter; topbar carries identity
only; sound toggle no longer in moderator panel; tests pass; preview matches
expectations on desktop + mobile.

### Phase 2 — Phase action button moves to the stage

Addresses F3. Currently `ResultsPanel`/`VoteDeck` render in the
`room-layout__aside` column, while "Reveal votes / Next round / Reset round"
are buttons rendered by `ModeratorControls` (via `desktopRoundActions`).

- **P2.1** Remove `desktopRoundActions` from `ModeratorControls.tsx` and the
  next-step buttons from its compact disclosure.
- **P2.2** Add a `<RoundActionBar>` component (new file) that renders the
  appropriate primary button for the current phase:
  - `revealed === false` → `Reveal votes` (primary, full-width)
  - `revealed === true` → `Next round` (primary, full-width) + `Reset round`
    (secondary, smaller)
  - Disabled with hint reuse from current `actionHint` logic.
- **P2.3** Mount `<RoundActionBar>` directly above `<VoteDeck>` /
  `<ResultsPanel>` inside `room-layout__aside` (or wherever the stage lives
  after Phase 3).

*Files*: `RoomPage.tsx`, `ModeratorControls.tsx`, new
`components/RoundActionBar.tsx`, `globals.css`.

**Exit criteria**: ModeratorControls panel ~40% shorter; primary action sits
adjacent to the deck/results so eye flow is "look at deck → click action."

### Phase 3 — Stage swap (deck/results to centerpiece)

Addresses F1. The biggest visual change. Invert the room layout columns.

- **P3.1** Change `.room-layout` grid to put the stage column first and
  wider. Proposed: `grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.7fr)`
  with `room-layout__main` now containing the stage (`<VoteDeck>` /
  `<ResultsPanel>` + `<RoundActionBar>`), and the aside containing
  `<ParticipantsBoard>`.
- **P3.2** Restyle `<ParticipantsBoard>` as a compact stack suitable for the
  narrower aside: avatar + name + small status dot per row, no big "Not
  voted" badges.
- **P3.3** Restyle `<VoteDeck>` cards for the now-wider centerpiece: bigger
  cards, more breathing room, hover/active states feel tactile.
- **P3.4** Mobile (`< 640px`) stays single-column; just stack stage above
  participants.

*Files*: `RoomPage.tsx`, `ParticipantsBoard.tsx`, `VoteDeck.tsx`,
`globals.css` (`.room-layout`, `.vote-deck`, `.participants-board`).

**Exit criteria**: deck visibly the focal point on first glance; no
horizontal scroll at any breakpoint; participant info still scannable.

### Phase 4 — Moderator drawer

Addresses F2. After Phase 2 + 3, ModeratorControls only contains: timer
display, duration field, start/reset/beep, room settings disclosure, transfer
host. Hide it behind a popover/drawer triggered from a moderator-only icon.

- **P4.1** Add a moderator-only ⚙︎ icon button to the topbar (next to the
  utility menu). Visible only when `isMeModerator(state)`.
- **P4.2** Render the existing `<ModeratorControls>` inside a drawer/popover
  triggered by the icon. Reuse `compact` mode internals.
- **P4.3** Remove the always-visible `<ModeratorControls>` mount from
  `RoomPage.tsx`. Keep the timer display visible to everyone via a slim
  `<TimerStrip>` in the stage area (just the countdown + a status chip).

*Files*: `RoomPage.tsx`, `TopBar.tsx`, new
`components/ModeratorDrawer.tsx`, possibly new
`components/TimerStrip.tsx`, `globals.css`.

**Exit criteria**: non-moderators see the deck/results stage immediately
with no chrome above. Moderators can still reach every existing setting in
two clicks.

### Phase 5 — Results presentation

Addresses F7, F8.

- **P5.1** Replace `<DistributionSection>` horizontal rows with a vertical
  column chart. One column per card value (in deck order, not sorted by
  count); height proportional to count; mode card highlighted via
  `--color-accent`. Pure CSS grid + `height: %` — no library.
- **P5.2** Replace `<KeyStatsCard>` + `<SecondaryStats>` 2×2 grid with a
  single horizontal stat strip:
  `Average · Median · Mode · Spread`. Each as a compact figure with
  consistent typography. Chart gets the freed vertical space.

*Files*: `ResultsPanel.tsx`, `globals.css`.

**Exit criteria**: results read at a glance; no panel taller than necessary
on desktop.

### Phase 6 — Empty-state invite hero

Addresses F6, F11. When the room has 1 participant (just the moderator),
swap the participants panel for an invite hero:

- Big readable room code (existing `--font-mono`)
- Copy room link button (primary)
- Optional QR code (only if it can be generated without a dependency — skip
  if it requires a new package)
- Friendly tagline ("Waiting for teammates…")

Once a 2nd participant joins, fade back to the regular ParticipantsBoard.

*Files*: new `components/InviteHero.tsx`, `RoomPage.tsx`,
`ParticipantsBoard.tsx` (or wrap it).

**Exit criteria**: first-room experience clearly says "share this with your
team."

### Phase 7 — Visual hierarchy polish

Addresses F9, F15. Cosmetic-only:

- **P7.1** Stage panel (the active deck/results column) gets a slightly
  elevated treatment: 1px border in `--color-border-strong`, background
  half a step lighter than `--color-surface`.
- **P7.2** Other panels stay at `--color-surface` (recede).
- **P7.3** Unify `participants-board__progress` and `room-status__progress`
  to use the same height/radius/gradient.
- **P7.4** Audit remaining panel headers for redundant eyebrows missed in
  P1.2.

*Files*: `globals.css`.

### Phase 8 — Web Interface Guidelines compliance pass

Addresses G1–G16. All small, surgical, low-risk fixes from the
Vercel guidelines audit. Can land independently of the layout phases —
schedule in parallel or after Phase 1 quick wins.

Bundled by topic:

- **P8.1 Focus & semantics** (G1, G3, G15)
  - Add `:focus-within` ring on `.language-switcher` to replace the
    removed `outline: none`.
  - Add a skip-link (`<a href="#main">Skip to content</a>`) at the top
    of `RoomPage` and `LandingPage`; matching `id="main"` and
    `scroll-margin-top` on the `<main>` element.
  - Drop redundant `aria-label` on TopBar leave button when label is
    visible; keep `title`.
  - *Files*: `globals.css`, `RoomPage.tsx`, `LandingPage.tsx`,
    `TopBar.tsx`.

- **P8.2 Live announcements** (G4, G5)
  - Add `aria-live="polite"` to the timer status chip in
    `RoomTimer.tsx`.
  - Add `role="status"` to the consensus chip in `ResultsPanel.tsx`.
  - *Files*: `RoomTimer.tsx`, `ResultsPanel.tsx`.

- **P8.3 Translate guards** (G6)
  - Add `translate="no"` to `<DeckToken>` root span (covers all uses).
  - *Files*: `DeckToken.tsx`.

- **P8.4 Tabular numbers** (G7)
  - Add `font-variant-numeric: tabular-nums` to
    `.participants-board__summary strong` and similar count-display
    elements.
  - *Files*: `globals.css`.

- **P8.5 Form input quality** (G8, G9)
  - Add `inputMode="numeric"`, `autoComplete="off"`,
    `pattern="[0-9]*"` to duration inputs.
  - Add `onWheel={e => e.currentTarget.blur()}` to prevent scroll-wheel
    mutation while focused.
  - *Files*: `RoomTimer.tsx`.

- **P8.6 Mobile touch hygiene** (G10, G11, G12)
  - `touch-action: manipulation` on `.button`, `.vote-card`,
    `.input` (or via a global `button, a, input { touch-action: manipulation }`).
  - `-webkit-tap-highlight-color: transparent` on body (or
    interactive elements).
  - Hide the Hide/Show roster toggle on desktop via media query
    (`display: none` above 720px) instead of always rendering it.
  - *Files*: `globals.css`, `ParticipantsBoard.tsx`.

- **P8.7 Modal scroll containment** (G13)
  - Add `overscroll-behavior: contain` to `.deck-modal` and any other
    modal/drawer surfaces (`RoundReportModal`, `SessionReportModal`).
  - *Files*: `globals.css`.

- **P8.8 Reduced motion** (G14)
  - Extend the `prefers-reduced-motion` block to include
    `transition-duration: 0.01ms !important` so progress-fill width
    transitions are also disabled.
  - *Files*: `globals.css`.

- **P8.9 Native UI theming** (G2)
  - Add `color-scheme: dark light;` on `:root` (or `html`) so native
    scrollbars/widgets follow the active theme. Override per-theme in
    `[data-theme="light"]` and dark blocks if needed.
  - *Files*: `globals.css`.

- **P8.10 Programmatic associations** (G16)
  - Add `aria-describedby` on each `.vote-card` button pointing to the
    shortcut hint id (when shown).
  - *Files*: `VoteDeck.tsx`.

**Exit criteria**: re-run `web-design-guidelines` skill — no findings
besides intentionally deferred items (e.g. URL-state for filters, which
isn't applicable here).

---

## Sequencing & rollback

- Phases are independent except: **P3 should land before P4** (drawer needs
  the new layout to make sense), and **P2 should land before P3** (so the
  stage already owns its primary button when the columns swap).
- **Phase 8** is fully independent — can land any time, even before
  Phase 1. Recommended order: P1 → P8 → P2 → P3 → P4 → P5 → P6 → P7.
- Skip P6 if QR generation needs a dependency we don't want.
- Each phase ends in a green CI run + a passing `npm run i18n:check`.

## Verification

For each phase, before merging:

1. `npm run lint && npm run test` (root).
2. Preview the change manually at three widths: 375 (mobile), 768 (tablet),
   1440 (desktop).
3. Check both light and dark themes (theme toggle in topbar).
4. Confirm the phase's "Exit criteria" above are met.

## Open questions

Tracked in `plans/open-questions.md` under `## Open` if any of the proposals
need decisions before we start. None as of writing.

---

## Out of scope (intentionally)

- Replacing the design system (tailwind, radix, etc.) — keep CSS vars.
- Adding a chart library for P5 — vertical bars are trivial CSS.
- Animating the layout swap in P3 — instant transition is fine.
- Redesigning the landing page — separate plan if needed.
- Server / shared changes — none required.
