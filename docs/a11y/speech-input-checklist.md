# Speech Input Validation Checklist

This checklist is for real speech-input testing. Code inspection can identify likely good candidates, but it cannot close this item.

## Target Tools

Recommended:

- macOS Voice Control
- Windows Voice Access or built-in speech recognition

Optional:

- mobile voice-control tooling if available

## Environment Setup

Record for each run:

- operating system and version
- speech-input tool and version
- browser
- locale
- YASP commit / deploy

Recommended setup:

1. Use a quiet environment and a microphone the tester trusts.
2. Prepare:
   - landing page
   - room pre-reveal
   - room revealed/results
   - deck modal open
   - second participant present for transfer moderation
3. If the tool supports both label targeting and numbered overlays, test label targeting first.

## Goal

Verify that visible labels and spoken command targets align closely enough for practical use, especially on high-value room actions.

## Priority Controls

### Landing Page

- `Create room`
- `Join room`
- `Customize`
- `Display name`
- role selector options

### Room Header

- `Copy link`
- `Leave`
- session preferences trigger
- theme control
- language control

### Moderator Controls

- `Reveal votes`
- `Next round`
- `Reset round`
- `Start`
- `Pause`
- `Reset`
- `Beep`
- `Timer & pacing`
- `Transfer moderation`

### Deck Modal

- `Simple`
- `Advanced`
- `Custom`
- `Use deck`
- close button

## Test Method

For each target control:

1. Note the exact visible label.
2. Attempt the natural spoken command a user would try first.
3. If needed, attempt one or two close variants.
4. Record:
   - whether the intended control was targeted
   - whether the wrong control was targeted
   - whether the command was ambiguous or required unnatural wording
   - whether overlays had to be used as a fallback

## Suggested Command Matrix

| Control | Visible label | Expected spoken command(s) | Actual result | Pass / Fail / Needs follow-up | Notes |
| --- | --- | --- | --- | --- | --- |
| Create room | `Create room` | `Click Create room` | | | |
| Join room | `Join room` | `Click Join room` | | | |
| Customize | `Customize` | `Click Customize` | | | |
| Copy link | `Copy link` or `Copy` | `Click Copy link`, `Click Copy` | | | |
| Leave | `Leave` | `Click Leave` | | | |
| Session preferences | `Connected` / `Live` / similar | `Click Connected`, `Click Live` | | | |
| Reveal votes | `Reveal votes` | `Click Reveal votes` | | | |
| Next round | `Next round` | `Click Next round` | | | |
| Reset round | `Reset round` | `Click Reset round` | | | |
| Start | `Start` | `Click Start` | | | |
| Pause | `Pause` | `Click Pause` | | | |
| Reset timer | `Reset` | `Click Reset` | | | |
| Beep | `Beep` | `Click Beep` | | | |
| Timer & pacing | `Timer & pacing` | `Click Timer and pacing`, `Click Timer & pacing` | | | |
| Transfer moderation | `Transfer` or `Transfer moderation` | `Click Transfer`, `Click Transfer moderation` | | | |

## Pass / Fail Criteria

- `Pass`: the natural visible-label command reliably targets the intended control
- `Fail`: the natural visible-label command fails, targets a different control, or requires memorizing a non-visible name
- `Needs follow-up`: command works but only with inconsistent phrasing or repeated retries

## Reviewer Guidance

- Treat ambiguity between similar labels as a real issue, especially for `Reset round` vs `Reset`.
- If the command requires a label that is not visible, record that as a failure.
- If the speech tool exposes number overlays instead of label targeting, note that separately; it does not replace label-in-name validation.
- If the tester must repeatedly use a workaround phrase instead of the visible label, treat that as `Needs follow-up` or `Fail` depending on severity.

Use [Evidence Template](./evidence-template.md) to capture each session.
