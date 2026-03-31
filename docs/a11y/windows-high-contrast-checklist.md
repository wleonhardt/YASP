# Windows High Contrast / Forced Colors Checklist

This checklist is for **real Windows High Contrast review**. Chromium forced-colors emulation and CSS inspection are supporting evidence only.

## Required Environment

- Windows 11 preferred, Windows 10 acceptable
- At least one browser:
  - Microsoft Edge preferred
  - Chrome recommended as secondary
- YASP running locally or from a deploy where the tester can create/join rooms

## Setup

1. Enable Windows High Contrast / a forced-colors theme in Windows Settings.
   - Windows 11: `Settings` → `Accessibility` → `Contrast themes`
   - Windows 10: `Settings` → `Ease of Access` → `High contrast`
2. Open YASP in the target browser.
3. Verify the browser is actually honoring forced colors.
4. Record:
   - Windows version
   - browser and version
   - active contrast theme
   - YASP commit / deploy

## YASP States to Review

1. Landing page
2. Landing page with deck customization modal open
3. Room page pre-reveal
4. Room page revealed/results
5. Moderator controls expanded/collapsed as applicable
6. Participant board with roster visible
7. Session preferences surface open

## Controls and Indicators to Inspect

- vote cards
- selected vote card state
- hover/current/focus states
- chips and badges:
  - room phase
  - connection/session status
  - timer/status chips
  - participant status chips
  - consensus chip
- progress bars / results distribution bars
- primary CTA visibility
- disabled buttons and disabled transfer state
- icon-only controls
- theme/language/session preferences controls

## Pass / Fail Criteria

Mark as `Pass` only if all of the following remain true:

- text remains readable
- selected/current states remain understandable without normal gradients/colors
- focus remains obvious
- buttons and inputs stay visible
- icons do not become invisible against their surfaces
- progress/fill indicators are still interpretable
- disabled states are still distinguishable without disappearing

Mark as `Fail` if:

- a control disappears or becomes unreadable
- selected/current state cannot be distinguished
- focus is effectively lost
- a progress/fill indicator has no visible meaning left

## Review Steps

### 1. Landing Page

- Verify heading, helper text, and form labels are readable.
- Tab through:
  - language
  - theme
  - display name
  - role selector
  - deck selector
  - `Customize`
  - `Create room`
  - room code
  - `Join room`
- Confirm focus remains visible on all controls.

### 2. Deck Customization Modal

- Open `Customize`.
- Verify:
  - modal title and subtitle are readable
  - tabs remain visible and current tab is obvious
  - sliders/toggles/checkboxes remain clear
  - preview chips remain readable
  - `Use deck` / reset / close controls remain visible

### 3. Room Page Pre-Reveal

- Check:
  - copy link
  - leave room
  - session preferences trigger
  - room phase chip
  - vote progress bar
  - live board header
  - vote cards
- Select a vote card and verify the selected state is unmistakable.

### 4. Moderator Controls

- Verify timer controls remain visible and understandable.
- If timer is present:
  - start/pause
  - reset
  - beep
  - sound
  - duration select
- Check primary round CTA visibility and disabled states.
- If transfer moderation is available, verify the transfer section remains readable.

### 5. Revealed Results

- Reveal votes.
- Verify:
  - results heading
  - consensus/no-consensus chip
  - key stats
  - distribution bars
  - next/reset actions

## Evidence to Capture

For each tested page/state capture:

- screenshot
- browser and theme used
- page/state name
- result
- issue severity if failed
- recommended fix

Use [Evidence Template](/Users/william/Projects/yasp/docs/a11y/evidence-template.md).

## Reviewer Log Table

Use this per-state table during the run:

| Page / state | Browser | Screenshot | Selected/current state clear? | Focus clear? | Progress / fill visible? | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Landing | | | | | | | |
| Deck modal | | | | | | | |
| Room pre-reveal | | | | | | | |
| Room revealed/results | | | | | | | |
| Session preferences | | | | | | | |
| Moderator controls | | | | | | | |

## Notes for Reviewers

- Browser emulation is useful support, but **do not** treat it as completion of this checklist.
- If Edge and Chrome differ, record both.
- If a state is “technically visible” but meaning is unclear, record that as a failure or `Needs follow-up`, not a pass.
