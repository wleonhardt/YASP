# Screen Reader Validation Checklist

This checklist is for real assistive-technology validation. It is not satisfied by axe, DOM inspection, or browser automation.

## Target Tools

Required:

- VoiceOver on macOS
- NVDA on Windows
- TalkBack on Android

Optional but useful:

- VoiceOver on iOS
- JAWS on Windows

## Shared Setup for Every Run

Before each screen-reader run:

1. Record OS, browser, AT version, theme, locale, and YASP commit/deploy.
2. Prepare one room with a second participant available so transfer moderation can be reviewed.
3. Prepare both pre-reveal and revealed room states.
4. Decide whether the run is desktop or mobile and note the viewport/device.

## Core YASP Flows to Test

1. Landing page
2. Create room
3. Join room
4. Room page pre-reveal
5. Room page revealed/results
6. Deck customization modal
7. Session preferences surface
8. Moderator controls
9. Transfer moderation flow when another participant exists

## Common Things to Verify

- page title correctness
- landmark discoverability
- heading structure
- control name + role clarity
- radio-group discoverability
- tablist discoverability
- modal announcement, focus trap, and focus return
- non-modal dialog behavior
- disabled-state explanation
- room-state/live announcement usefulness
- results reading order
- participant roster comprehension
- whether navigation is merely possible vs. understandable in practice

## Reviewer Notes to Capture

Always record:

- what the AT announced
- whether the announcement was sufficient
- whether anything was noisy, repetitive, or confusing
- whether the user could complete the task confidently

Use [Evidence Template](./evidence-template.md) for each run.

## Minimum Evidence Per Tool

- one landing-page capture
- one modal capture
- one room pre-reveal capture
- one room revealed/results capture
- explicit notes for:
  - page title
  - landmarks/headings
  - announcements
  - focus return
  - any confusion/noise

## VoiceOver on macOS

### Environment

- macOS with VoiceOver enabled
- Safari preferred, Chrome optional secondary

### Navigation Model

- VO navigation
- Tab/Shift+Tab
- rotor/landmark and heading navigation

### Specific Checks

#### Landing Page

- Is the page title announced correctly?
- Can the tester find the main landmark?
- Are `Display name`, role selector, deck selector, `Customize`, `Create room`, and `Join room` all understandable?
- Is the role selector announced as a radio group with a meaningful label?

#### Deck Customization Modal

- Does opening `Customize` announce a dialog with a meaningful name?
- Is focus moved into the dialog?
- Are `Simple`, `Advanced`, `Custom` exposed as tabs clearly?
- Are controls inside understandable and navigable?
- Does closing return focus to `Customize`?

#### Room Page Pre-Reveal

- Are the room heading/round and live board sections discoverable?
- Are `Copy link`, `Leave`, and `Session preferences` named clearly?
- Are vote cards announced consistently?
- Is the selected vote/current state understandable?
- Are moderator controls understandable, including timer controls and disabled reasons?
- If another participant is present, is `Transfer moderation` discoverable and understandable?

#### Revealed Results

- Is the results heading discoverable?
- Is the reading order of key stats and distribution understandable?
- Are consensus/no-consensus announcements meaningful?
- Are participant cards and revealed votes understandable without visual context?

### Pass / Fail Criteria

- `Pass`: task completion is possible and the spoken output is understandable
- `Fail`: control naming, grouping, or announcements materially block task completion
- `Needs follow-up`: technically navigable, but confusing or noisy enough to need a second reviewer

## NVDA on Windows

### Environment

- Windows with NVDA
- Firefox preferred, Chrome optional secondary

### Navigation Model

- browse mode
- focus mode
- headings, landmarks, form fields, buttons, tables/lists if exposed

### Specific Checks

Repeat the same YASP flows as VoiceOver, with special attention to:

- dialog announcement quality
- form mode switching
- live-region announcements during room-state changes
- how disabled actions and helper text are read
- whether results metrics and participant roster remain understandable in browse mode
- whether the session preferences dialog and moderator controls remain understandable in both browse and focus modes

## TalkBack on Android

### Environment

- Android device with TalkBack
- Chrome on Android preferred

### Navigation Model

- swipe navigation
- double-tap activation
- local/global context menus if used

### Specific Checks

- landing page controls are reachable in a sensible order
- role selector and deck controls are understandable on mobile
- session preferences trigger and surface are understandable
- moderator controls remain understandable in compact layout
- timer drawer open/close is announced correctly
- revealed results and participant roster remain readable without visual context
- transfer moderation remains understandable when present

## Optional: VoiceOver on iOS / JAWS

If run, use the same YASP flows and capture evidence with the same template. Treat these as additive evidence, not substitutes for the required streams above.

## Per-Tool Result Template

| Field | Value |
| --- | --- |
| AT / version | |
| OS / browser | |
| Flow tested | |
| Controls exercised | |
| What was announced | |
| Was the task understandable? | |
| Issue found? | |
| Severity | |
| Notes / recommended fix | |

## Severity Guidance for AT Findings

- `High`: the user cannot complete the task or understand a core state
- `Medium`: the task is possible, but announcements or navigation are confusing enough to risk failure
- `Low`: understandable but rough, noisy, or inconsistent
