# Accessibility Manual Validation Plan

This plan covers the remaining accessibility work that cannot be honestly closed out with axe, browser automation, or code review alone.

It is intentionally narrow and evidence-driven. It does **not** replace the completed browser-based QA documented in:

- [ACCESSIBILITY_MANUAL_QA_CHECKLIST.md](./ACCESSIBILITY_MANUAL_QA_CHECKLIST.md)
- [ACCESSIBILITY_WCAG_2_2_AAA_AUDIT.md](./ACCESSIBILITY_WCAG_2_2_AAA_AUDIT.md)
- `tmp/ACCESSIBILITY-MANUAL-QA-REPORT.md`

## Remaining Validation Streams

1. Real Windows High Contrast / forced-colors review on Windows
2. Real screen-reader validation
3. Real speech-input validation
4. AAA contrast documentation and signoff

Detailed workflows:

- [Windows High Contrast Checklist](./docs/a11y/windows-high-contrast-checklist.md)
- [Screen Reader Checklist](./docs/a11y/screen-reader-checklist.md)
- [Speech Input Checklist](./docs/a11y/speech-input-checklist.md)
- [AAA Contrast Signoff Matrix](./docs/a11y/aaa-contrast-signoff-matrix.md)
- [Evidence Template](./docs/a11y/evidence-template.md)

## Ground Rules

- Do not mark a stream complete unless a human tester runs it in the required environment.
- Browser emulation, DOM inspection, and code review are supporting evidence only.
- Keep findings tied to concrete YASP flows and controls.
- Capture evidence for both pass and fail results.
- When a result is uncertain, record it as `Needs follow-up`, not `Pass`.

## Suggested Execution Order

Run the remaining validation streams in this order:

1. Windows High Contrast
   - confirms whether the current forced-colors fallback survives a real Windows environment
2. Screen readers
   - validates structure, announcements, and real task comprehension
3. Speech input
   - validates practical label-in-name behavior after the code-level fixes
4. AAA contrast signoff
   - should use the final rendered states after the other streams surface any visual remediation

## Preconditions for Reviewers

Before starting any stream:

1. Use a build or deploy with a known commit SHA.
2. Record the exact locale and theme being tested.
3. Prepare at least two browser sessions or devices so the transfer-moderation flow can be exercised.
4. Prepare at least one room in each of these states:
   - landing page
   - room pre-reveal
   - room revealed/results
   - deck modal open
   - session preferences open
5. If testing moderator controls, ensure the tester can access:
   - timer controls
   - reveal / next round
   - transfer moderation with another participant present

## YASP Flows That Must Be Covered

These flows are the minimum baseline across the remaining manual streams:

1. Landing page
   - Display name
   - Role selector
   - Deck selector
   - `Customize`
   - `Create room`
   - `Join room`
   - language/theme controls
2. Create-room path
3. Join-room path
4. Room page, pre-reveal
   - copy link
   - leave room
   - session preferences
   - participant roster
   - vote cards
   - moderator controls
   - timer controls
5. Room page, revealed/results
   - revealed vote state
   - results metrics
   - distribution bars
   - next/reset round actions
6. Deck customization modal
7. Transfer moderation flow when a second participant is present

## Suggested Evidence Package Structure

Store evidence outside source-controlled product files when practical. A suggested reviewer-local structure:

```text
tmp/a11y-manual-validation/
  2026-04-xx/
    windows-high-contrast/
    voiceover-macos/
    nvda-windows/
    talkback-android/
    speech-input/
    contrast/
```

Recommended naming:

- screenshots: `01-landing-dark.png`, `02-room-prereveal.png`
- recordings: `voiceover-room-results.mov`
- notes: `findings.md`
- exported measurements: `contrast-matrix.csv`

## Minimum Evidence Per Validation Stream

### Windows High Contrast

- environment details
- browser name and version
- screenshots for each tested state
- explicit pass/fail notes for selected states, focus, and disabled states

### Screen Readers

- AT name and version
- OS + browser
- flow tested
- notes on announcement quality, confusion, and navigation behavior
- audio/video capture if available

### Speech Input

- tool name and version
- spoken command attempted
- target control
- actual result
- ambiguity notes

### AAA Contrast

- component/state
- theme
- measured foreground/background pair
- ratio
- screenshot reference
- reviewer signoff or remediation note

## Completion Criteria

The remaining accessibility work can only be considered complete when:

- Windows High Contrast has been reviewed on real Windows
- at least one real desktop screen reader and one mobile screen reader have been used
- speech-input behavior has been exercised with real software
- the AAA contrast matrix is filled with real measurements, not approximate reasoning

Until then, YASP should continue to be described as accessibility-improved and under ongoing manual validation, not as formally WCAG conformant.
