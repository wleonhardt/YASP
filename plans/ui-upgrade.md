# UI Upgrade Plan

Status: `in progress`
Date: 2026-05-04

A staged plan to rework the room UI hierarchy so the *current action* is the
visual centerpiece, moderator chrome recedes, and the topbar carries identity
only. Driven by a hands-on review of the live app — see the "Findings" section
for the audit that motivated each change.

## Implementation progress

- 2026-05-05: Started with the independent Phase 8 foundation pass. Landed
  skip links, native color-scheme hints, language-switcher focus restoration,
  deck-token translate guards, timer/status live announcements, duration input
  mobile hints, vote-card shortcut associations, touch hygiene, and modal
  scroll containment. Remaining layout work still starts with Phase 1 quick
  wins, then Phase 2 `RoundActionBar`.
- 2026-05-05: Landed the low-risk Phase 1 visual cleanup subset, excluding
  sound relocation. The topbar now carries identity/utilities only,
  Participants and Revealed votes dropped redundant eyebrows, Start carries
  primary visual weight, Reset/Beep remain quieter actions, and the duration
  minutes/seconds inputs read as one grouped control. Next Phase 1 slice is
  the sound-toggle relocation into the utility menu, then Phase 2
  `RoundActionBar`.
- 2026-05-05: Completed Phase 1 by relocating the interactive timer sound
  toggle into the utility menu. `RoomTimer` now subscribes to the shared
  preference and shows only a read-only sound indicator beside the countdown.
  The utility-menu toggle preserves audio priming and the preference still
  persists in `localStorage`. Next implementation slice is Phase 2:
  `RoundActionBar`.
- 2026-05-05: Completed Phase 2 by adding `RoundActionBar` above the
  deck/results stage and removing Reveal/Next/Reset actions from
  `ModeratorControls` in both desktop and compact modes. The one-primary-CTA
  invariant now lives in `RoundActionBar`. Next implementation slice is
  Phase 3: stage layout.
- 2026-05-05: Completed Phase 3 by making deck/results the primary stage
  column, moving Participants into a compact awareness rail, and enlarging
  the stage vote deck. The rail keeps names visible and highlights connected
  voters who have not voted yet. Next implementation slice is Phase 4:
  moderator drawer.
- 2026-05-05: Completed Phase 4 by moving `ModeratorControls` into a
  moderator-only topbar drawer and adding a shared `TimerStrip` above the
  stage so timer status remains visible to everyone. Non-moderators no longer
  see moderator chrome in the room body. Next implementation slice is Phase 5:
  results presentation.
- 2026-05-05: Completed Phase 5 by replacing the revealed-round distribution
  rows with a deck-ordered vertical column chart, preserving non-deck vote
  tokens, separating non-numeric card buckets when mixed with numeric cards,
  and collapsing the results stats into a compact Average / Median / Mode /
  Spread strip. Next implementation slice is Phase 6: empty-state invite hero.
- 2026-05-05: Completed Phase 6 by replacing the participant rail with an
  invite hero while a room has no connected non-moderator voters. The hero
  promotes the room code and a primary copy-link action, keeps spectators in
  the invite state until a voter joins, and skips QR generation to avoid a new
  dependency. Next implementation slice is Phase 7: visual hierarchy polish.
- 2026-05-05: Completed Phase 7 by making default panels recede to the
  surface token, giving the stage deck/results panel the stronger
  border/background treatment, and keeping room/participant progress bars on
  the same shared styling. The header audit found no remaining redundant
  operational panel eyebrows to remove. Next implementation slice is optional
  Phase 9 spotlight enhancements.

---

## Product context & strategic direction

Before more tactical phases, this section reasons about *who uses YASP, when,
and how often* — and lets that drive UI weight. The conclusion (a stage-style
layout with role-aware chrome) shapes the rest of the plan.

### What YASP actually is

A real-time, ephemeral scrum poker room. No accounts, no history, one URL per
session. Sessions are short (15–60 min), high-presence (everyone is "live"),
and structured into rounds:

```
[ Voting → Reveal & discuss → Next round ]  × N stories
```

Most teams estimate 5–15 stories per session. So the same UI gets traversed
5–15 times in 30 minutes. **Anything that takes more than one click per round
is friction multiplied by N.**

### Three roles, very different usage patterns

| Role | Count per room | What they do | UI weight they should command |
|---|---|---|---|
| **Moderator** | 1 | Sets up the room once; clicks Reveal + Next Round each round. Rarely changes settings, almost never transfers host. | A small persistent action bar + a deep settings drawer. |
| **Voter** | 2–20+ | Picks one card per round. Stares at results during discussion. | The voting deck and the results chart. That's the entire UI for them. |
| **Spectator** | 0–5 | Watches. No interaction. | Same results view as voters. No deck. |

### Time/click frequency table

The basis for all weighting decisions. "Per round" means per story estimate.

| Action | Role(s) | Per round | Per session (10 rounds) | Per week |
|---|---|---|---|---|
| Click vote card | Voter | 1 | 10 | 10–30 |
| Click Reveal | Moderator | 1 | 10 | 10–30 |
| Click Next round | Moderator | 1 | 10 | 10–30 |
| View results chart | All | 1 (then 30s–5min staring) | 10 | 10–30 |
| Discuss outliers | All | 0–1 | 5 | 5–15 |
| Set timer duration | Moderator | 0 | 0–1 | 0–1 |
| Start/Pause/Reset timer | Moderator | 0–1 | 0–3 | 0–3 |
| Hit Beep | Moderator | ≤0.1 | 0–1 | 0–1 |
| Toggle sound | Anyone | 0 | 0–1 (once ever) | 0 |
| Change room settings | Moderator | 0 | 0 (set at create) | 0–1 |
| Transfer host | Moderator | 0 | 0 | ~0 |
| Copy room link | Moderator | 0 | 1 (at start) | 1–3 |
| Re-vote / change vote | Voter | 0–0.3 | 0–3 | 0–3 |
| Leave room | All | 0 | 1 (end) | 1–3 |

**Reading this table**: voting + revealing + viewing results account for ~95%
of all interactions. Everything else is one-shot setup or near-zero. The UI
currently allocates space inversely — moderator settings are large and
permanent, the deck and results are crammed into a sidebar.

### Where users spend time (not clicks — *eye time*)

Clicks are spiky; gaze is continuous. Eye time per round, roughly:

- **Voting phase (15s–2min)**: voters stare at the deck deciding what to
  pick. Moderator stares at "who's voted". Spectators stare at the
  participants list.
- **Reveal phase (30s–5min)**: everyone stares at the results chart while
  discussing why estimates differ. *This is the longest single state per
  round.*
- **Between rounds (≤5s)**: brief; whoever moderates clicks Next.

So the **results view** quietly wins the most attention per session, even
though it has the fewest interactions. It's also where the worst UX leverage
is right now — the chart is a small horizontal-list in the sidebar.

### What this means for the UI

Five conclusions that should govern every layout choice from here on:

1. **The stage is the deck or the chart, never the moderator panel.**
   Whatever phase we're in, the largest, brightest element on screen should
   be the thing voters/spectators are looking at.

2. **Moderator chrome is optional UI for one person.** It should be a thin
   action bar (Reveal/Next + timer countdown), with the rest behind a gear.
   Non-moderators should never see most of it.

3. **Participants list is a *peripheral awareness* widget, not the main
   event.** Compact avatar row that shows status at a glance; doesn't need
   prime real estate.

4. **Empty/lobby state is a separate concern.** When the room has 1 person,
   the entire screen should say "share this link." Once 2+ people are
   present, the room enters its operational mode.

5. **Optimize for the long stares, not the rare clicks.** Settings panels
   can be ugly. The results chart cannot.

### Layout patterns considered

These are the candidate shapes we evaluated for the *operational room view*
(post-lobby, in-session). Each evaluated against: moderator workload,
voter clarity, results-staring quality, and mobile feasibility.

#### A. Single-screen no-scroll (current)
Everything visible: topbar + moderator panel + participants + (deck OR
results) all crammed into one viewport.

- Pros: ambient awareness; never need to scroll.
- Cons: nothing dominates; the prime action is small; cramped on small
  screens; vast empty space on large screens.
- **Verdict: this is what we have. The plan rejects it.**

#### B. Stage layout (recommended)
A central "stage" element (deck or chart) takes the dominant column.
Participants live in a compact aside or rail. Moderator gets a slim action
bar above the stage. Non-deck/chart UI shrinks to the edges.

- Pros: clear focus per phase; scales from mobile to wide; matches what
  mobile compact mode already looks like (which was visibly better).
- Cons: requires layout swap (moderate effort); need to define what
  participants UI looks like when small.
- **Verdict: this is the recommended direction. Phases 2–4 implement it.**

#### C. Tab pattern (Vote / Discuss / Results)
Explicit tabs for each phase. Big stage per tab.

- Pros: very clear what to do; can present each phase in its ideal shape.
- Cons: hides ambient awareness ("who's voted?" requires a tab switch);
  loses the calm "everyone in one room" feeling that's a core product
  value; extra clicks.
- **Verdict: rejected. YASP is a live meeting tool, not a wizard.**

#### D. Tabletop metaphor (avatars around a virtual table)
Round table with participant avatars positioned around it; cards face-down
in the middle until reveal.

- Pros: evocative, fun, clearly a "poker" thing.
- Cons: doesn't scale beyond ~8 people without weird zoom math; demands
  custom layout code; novelty wears off; ignores the fact that the
  product is about the *chart*, not the table.
- **Verdict: rejected. Cute, not useful.**

#### E. Spotlight / now-showing
Layout dynamically promotes whatever is most relevant *right now*: deck
during voting, "waiting on Bob" during last-vote, results chart on reveal,
"consensus reached" celebration on perfect agreement.

- Pros: always shows the right thing; feels alive.
- Cons: more state-driven UI = more visual flicker risk; harder to
  implement correctly; users can lose orientation if things move too much.
- **Verdict: layer this on top of B over time. Don't build it from
  scratch. Phase 9 (new) sketches a path.**

### Voting deck shape

The deck itself deserves separate consideration — it's the second most
stared-at element after results.

| Shape | Pros | Cons | Recommendation |
|---|---|---|---|
| **Grid (current)** | Familiar; works for any deck size; scales responsively | Feels like a button menu, not "playing a card" | Keep as default |
| **Hand-of-cards arc** | Tactile, evocative of poker; fun | Doesn't scale beyond ~10 cards; awkward responsive behavior; harder a11y | Rejected |
| **Number pad** | Fast tap target; phone-keypad familiar | Doesn't work for T-shirt or custom decks; just a renamed grid | Rejected |
| **Slider** | Quick continuous picking | Conflicts with discrete-deck model; doesn't work for non-numeric decks | Rejected |
| **Big grid + keyboard hint** | Same as current but with the shortcut key visible *on each card* (e.g. small `5` glyph in a corner) | Tiny extra design work | **Adopt as deck enhancement** |

### Results chart shape

The single highest-leverage display change. Considered shapes:

| Shape | Pros | Cons | Recommendation |
|---|---|---|---|
| **Horizontal list (current)** | Simple; sorted by popularity is intuitive | Feels like a leaderboard, not a distribution; no spatial sense of "where did people land" | Reject |
| **Vertical column chart** | Genre convention; instantly readable; spatial intuition (left = low, right = high); mode is the tallest column | Trivial CSS, no library needed | **Adopt** |
| **Beeswarm / dot plot** | Each vote a dot; shows individuals | Custom rendering work; cluttered with >10 votes | Defer; nice-to-have |
| **Box-and-whisker** | Shows median + spread + outliers in one viz | Boxplots feel academic; most people don't read them fluently | Reject |
| **Player faces under each column** | Combines distribution + "who voted what" | Genuine UX win — voters often want to know *who* picked the outlier | **Adopt** as Phase 5 enhancement: each column has the avatars of voters who picked it stacked underneath |

### Discussion-phase enhancements (new territory)

The reveal-and-discuss phase is where YASP could differentiate. Brief ideas
worth keeping on the radar — not committed phases, just options:

- **Outlier highlighting**: when one or two votes are far from the mode,
  surface them: "Alice picked 13, others picked 5. Discuss?"
- **Re-vote affordance**: after discussion, moderator can "re-open voting"
  and the deck swaps back in. Currently you Reset the round, which feels
  destructive.
- **"Talk to Bob" prompt**: when consensus is *almost* reached (e.g. one
  outlier), name the person who differs.
- **Story labels / queue**: many teams estimate 5–15 stories. Letting the
  moderator type a story title at the top of each round (and showing the
  list of estimated stories at the end) would make YASP usable as the
  *only* tool for an estimation meeting, not just one tab among many.

These are explicitly out-of-scope for this plan but should land in
[`open-questions.md`](open-questions.md) for follow-up.

### Mobile / tablet / desktop posture

Observed usage shape (assumption — verify with analytics if you add them):

- **Desktop**: ~50% of voters. Sitting at their dev machine.
- **Mobile**: ~30%. Walking standup, bathroom, "I'll join from my phone"
  during a meeting.
- **Tablet**: ~20%. Conference room iPads / large touch screens.

Implications:

- **Mobile-first** for the deck and results. Big tap targets. The compact
  layout we already have is the win.
- **Desktop should not be "mobile + sidebar"**. Use the extra width for a
  larger results chart and avatar stack — not for piling more chrome onto
  the page.
- **Tablet (768–1024) is the most-broken breakpoint right now** (V1, V2).
  When fixing the layout, test 768 explicitly.

### What this means for the existing phases

The strategic direction reframes the existing phase priorities slightly:

- **Phase 2 (action button to stage) and Phase 3 (stage swap)** become
  the *load-bearing* phases. They implement Conclusion 1.
- **Phase 4 (moderator drawer)** implements Conclusion 2. It depends on
  Phase 3.
- **Phase 5 (results)** is much higher leverage than it appears — it
  improves the longest-staring view.
- **Phase 6 (invite hero)** implements Conclusion 4 — empty-room becomes
  its own state, not a sparse version of operational room.
- **Phase 1 (quick wins) and Phase 8 (compliance)** stay parallel; they're
  small surgical fixes that don't depend on the strategic direction.
- **New: Phase 9 (spotlight enhancements)** is added at the end as a
  catch-all for state-driven niceties (waiting-on-Bob, almost-consensus,
  outlier highlighting).

---

## Goals

Derived from the strategic direction above. Each goal traces back to the
role/frequency analysis.

1. **Stage > chrome.** Make the current phase action (vote → reveal → next)
   the unmistakable focus. Voters and spectators should never wonder what
   they're supposed to look at.
2. **Role-aware UI weight.** A moderator's settings panel is one person's
   tool used rarely; it should not occupy 30% of every voter's screen.
   Demote moderator chrome to a slim action bar + drawer.
3. **Optimize the long stares.** The results chart is what everyone looks
   at the longest, even though it's clicked the least. Treat it as the
   star of the show.
4. **Lobby vs. operational state are distinct.** A 1-person room is a
   lobby — show the invite, hide the operational chrome.
5. **Topbar = identity + utilities only.** Strip out session status; it
   belongs near the stage.
6. **Preserve the ambient/calm feel.** YASP's value is "everyone in one
   live room." Don't add tabs, wizards, or modals that fragment that
   feeling.
7. **Surgical, reversible changes.** Each phase = one commit, one revert
   path, one verifiable improvement.

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

### Live visual review (web-design-reviewer skill)

Captured 2026-05-04 against `localhost:5173` at 1440 (desktop), 768
(tablet), and 375 (mobile) breakpoints. New findings on top of F1–F15.

| # | Finding | Why it matters |
|---|---|---|
| V1 | Tablet 768px: TopBar `grid-template-columns: 1fr 1.15fr auto` collapses awkwardly. "Round 1 / Voted / progress bar" wraps to a second row, progress bar cuts short of the right edge (misaligned with content). | TopBar redesign in P1.5 must explicitly handle 600–900 range, not just desktop+mobile |
| V2 | At 768px the gap between timer controls and the floating "Reveal votes" / "Reset+Next" buttons becomes proportionally worse — controls cluster center-left, action sits far-right. | Reinforces F3: button needs to leave the moderator panel (Phase 2) |
| V3 | **Mobile (375px) compact layout is dramatically better than desktop.** "NEXT STEP / Voting / Reveal votes (full-width primary)" + collapsed Timer & Settings disclosures is exactly the target shape. | Phase 4's "moderator drawer" and Phase 2's "phase action on stage" can be derived directly from the existing compact mode — much of the React already exists |
| V4 | **Regression in shipped CSS**: `.distribution-row__label span { color: var(--color-text-secondary) }` (globals.css:2720) silently overrode the prominent-count color set in `.distribution-row__count` (line 2696, same specificity, later rule wins). The "make result number prominent" change from the original 3-change ask never visually landed. | Fixed inline in this session (`:not(.distribution-row__count)` selector); flag to verify before any P5 work that distribution count actually renders bright |
| V5 | Stat tile meta line ("Consensus" under Most Common) hangs at the bottom of the tile while sibling tile (Spread) has no meta — visually unbalanced 2×2 grid. | Reinforces F8: kill the 2×2 grid, do a horizontal stat strip in P5.2 |
| V6 | Topbar progress bar (when filled at reveal) gradient looks great, BUT it's the only place that gradient appears at the top of the page — no echo elsewhere. After demoting/removing it (per F5), consider whether the participants progress bar should pick up the same gradient treatment for visual continuity. | Cosmetic; address inside P7.3 |
| V7 | At desktop, the empty-state participants area shows: avatar dot + "Alice (You)" card + "Not voted" badge + dashed `…` placeholder box. Four UI treatments for "you're alone." | Reinforces F11: P6 invite hero |

---

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

- **P1.1 Move Sound toggle to TopBar utility menu, keep tiny indicator
  near timer.** Addresses F4. Render the existing
  `SoundOnIcon`/`SoundOffIcon` button (interactive) inside
  `RoomUtilityMenu.tsx` alongside Theme/Language. Keep the audio-priming
  behaviour. Remove the *interactive* toggle from `RoomTimer.tsx` but
  leave a small **read-only** sound-state glyph (no button, just an
  `aria-hidden` icon with a tooltip) adjacent to the timer countdown so
  users don't lose mid-meeting orientation ("did the sound just turn
  off?"). Clicking the glyph is a no-op; the actual control lives in the
  utility menu.
  - *Files*: `RoomUtilityMenu.tsx`, `RoomTimer.tsx`, `globals.css`
    (drop `.room-timer__sound-toggle`, add a small
    `.room-timer__sound-indicator`).
  - *Verify*: sound preference persists to `localStorage`, beep still
    fires, indicator reflects state without being focusable.

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
- **P2.4 UI invariant (codify here, enforce in review):** *There is
  exactly one primary CTA per phase, and it must always live in the
  stage-header zone above the deck/results. It must never be re-added
  inside `ModeratorControls` or any meta panel.* Future PRs that violate
  this rule should be rejected at review.

*Files*: `RoomPage.tsx`, `ModeratorControls.tsx`, new
`components/RoundActionBar.tsx`, `globals.css`.

**Exit criteria**: ModeratorControls panel ~40% shorter; primary action sits
adjacent to the deck/results so eye flow is "look at deck → click action";
"one primary CTA per phase in the stage zone" rule documented in code
comment on `<RoundActionBar>`.

### Phase 3 — Stage swap (deck/results to centerpiece)

Addresses F1. The biggest visual change. Invert the room layout columns.

- **P3.1** Change `.room-layout` grid to put the stage column first and
  wider. Proposed: `grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.7fr)`
  with `room-layout__main` now containing the stage (`<VoteDeck>` /
  `<ResultsPanel>` + `<RoundActionBar>`), and the aside containing
  `<ParticipantsBoard>`.
- **P3.2** Restyle `<ParticipantsBoard>` as a compact stack suitable for the
  narrower aside: avatar + name + small status dot per row, no big "Not
  voted" badges. **Group-awareness guardrail**: the demoted board must
  still let a moderator answer *"who hasn't voted yet?"* in under one
  second of glance. Suggested treatment: 1-letter initial in a circle,
  filled green when voted, hollow grey when not, dim grey when offline.
  Keep names visible on hover/tap. The "missing" state must be the most
  visible because it's the actionable one.
- **P3.3** Restyle `<VoteDeck>` cards for the now-wider centerpiece: bigger
  cards, more breathing room, hover/active states feel tactile.
- **P3.4** Mobile (`< 640px`) stays single-column; just stack stage above
  participants.

*Files*: `RoomPage.tsx`, `ParticipantsBoard.tsx`, `VoteDeck.tsx`,
`globals.css` (`.room-layout`, `.vote-deck`, `.participants-board`).

**Exit criteria**: deck visibly the focal point on first glance; no
horizontal scroll at any breakpoint; participant info still scannable;
**acceptance test**: in a 4-person room with 3 voted and 1 not, a
moderator can identify the un-voted person within one second of looking
at the demoted participants rail.

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
  **Non-numeric tokens**: `?` and `☕` (and any custom-deck non-numeric
  values) must each render as their own column at the right end of the
  chart, in the order they appear in the deck. Never silently drop
  votes. If the deck contains both numeric and non-numeric values, add
  a thin vertical separator between the numeric region and the
  non-numeric region so the chart still reads as "scale of estimates +
  bucket of meta-votes."
- **P5.2** Replace `<KeyStatsCard>` + `<SecondaryStats>` 2×2 grid with a
  single horizontal stat strip:
  `Average · Median · Mode · Spread`. Each as a compact figure with
  consistent typography. Chart gets the freed vertical space.

*Files*: `ResultsPanel.tsx`, `globals.css`.

**Exit criteria**: results read at a glance; no panel taller than necessary
on desktop.

### Phase 6 — Empty-state invite hero

Addresses F6, F11. **Trigger**: show the invite hero when the room has
**no other connected voters** — i.e. either it's just the moderator,
or it's the moderator plus one or more spectators with no voters yet.
A "moderator + 3 spectators" room is still functionally empty for
estimation purposes and should keep prompting for voter invites.
Hide the hero as soon as a connected voter (other than the moderator,
if the moderator is also a voter) is present. Swap the participants
panel for an invite hero containing:

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

### Phase 9 — Spotlight enhancements (state-driven niceties)

Catch-all for the layered "now-showing" pattern (option E from the
strategic direction). All entries here are individually optional —
ship them à la carte once Phase 3 is in place. None are commitments.

- **P9.1 Waiting-on-Bob**: when N–1 of N voters have voted, gently
  highlight the missing voter's avatar and replace the "X/N voted" pill
  with "Waiting on Bob…". Calm, not naggy.
- **P9.2 Outlier callout**: post-reveal, when one or two votes are >2
  cards from the mode, surface a one-line prompt above the chart.
  **Tone-safe phrasing only**: default copy reads
  *"One estimate differs — worth a quick check?"* (no name shown). The
  outlier's name appears only on hover/click/expand of the prompt, not
  in the headline. Never shame, never default-spotlight; the goal is
  facilitating discussion, not calling people out.
- **P9.3 Re-open voting**: after reveal, moderator gets a "Re-open vote"
  affordance distinct from "Reset round" — keeps existing votes visible
  as defaults, lets people change without destroying the round state.
- **P9.4 Almost-consensus prompt**: when one outlier is the only
  difference, surface a tone-safe prompt: *"Almost there — one
  estimate differs."* Same rule as P9.2: the differing person's name
  is revealed only on click/expand, never in the headline.
- **P9.5 Story labels**: optional text input at the top of each round
  for the story being estimated. Carries through to the round report.
  Enables the "single tool for the whole meeting" use case.
- **P9.6 Consensus celebration**: when everyone votes the same, a brief
  positive flourish (existing consensus chip + maybe a soft confetti
  burst respecting `prefers-reduced-motion`). Keep tasteful.

*Files*: `RoomPage.tsx`, `ResultsPanel.tsx`, `ParticipantsBoard.tsx`,
new `components/RoundSpotlight.tsx` for the meta-prompts above the
chart.

**Exit criteria** (per sub-feature): visibly improves the discussion
phase without adding clutter. Each item should be removable without
breaking layout.

---

## Sequencing & rollback

- Phases are independent except: **P3 should land before P4** (drawer needs
  the new layout to make sense), and **P2 should land before P3** (so the
  stage already owns its primary button when the columns swap).
- **Phase 8** is fully independent — can land any time, even before
  Phase 1. Recommended order: **P1 → P8 → P2 → P3 → P4 → P5 → P6 → P7**,
  then individually pick Phase 9 sub-features as desired.
  **Why P8 lands before P2 (not after)**: once layout starts moving
  (Phase 2 onward), it's easy to accidentally regress focus traps,
  aria-live announcements, scroll containment, and tab order. Landing
  the compliance pass against the *current stable* layout means later
  phases inherit the fixes and any regressions become more obvious in
  review.
- **Phase 9** items each depend on Phase 3 (stage layout) being in
  place, but are otherwise independent and à la carte.
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
