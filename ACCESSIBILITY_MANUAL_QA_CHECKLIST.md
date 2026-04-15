# Accessibility Manual QA Checklist

Use this checklist for release-facing accessibility sanity checks. It complements automated lint and axe smoke tests; it does not replace assistive-technology validation.

Last updated: 2026-03-31 (manual QA pass via browser automation + targeted remediation follow-up + post-fix verification)

## How To Use This Checklist

- Use this file for the browser/manual QA that has already been completed or can be rerun in ordinary desktop/mobile browser environments.
- Use [ACCESSIBILITY_MANUAL_VALIDATION_PLAN.md](./ACCESSIBILITY_MANUAL_VALIDATION_PLAN.md)
  for the remaining specialist manual work that requires real assistive
  technology, Windows High Contrast, or formal contrast measurement.

Remaining specialist workflows:

- [Windows High Contrast Checklist](./docs/a11y/windows-high-contrast-checklist.md)
- [Screen Reader Checklist](./docs/a11y/screen-reader-checklist.md)
- [Speech Input Checklist](./docs/a11y/speech-input-checklist.md)
- [AAA Contrast Signoff Matrix](./docs/a11y/aaa-contrast-signoff-matrix.md)
- [Evidence Template](./docs/a11y/evidence-template.md)

## Keyboard Navigation

- [x] Confirm the landing page can be used without a mouse.
- [x] Confirm `Create room`, `Join room`, deck selection, and role selection all work with keyboard only.
- [x] Confirm room actions, vote cards, transfer-host controls, and leave/copy/theme controls are reachable in a logical order.

## Modal Behavior

- [x] Open the deck customization modal.
- [x] Confirm focus moves into the modal on open.
- [x] Confirm `Tab` and `Shift+Tab` stay trapped inside the modal.
- [x] Confirm `Escape` closes the modal.
- [x] Confirm focus returns to the control that opened the modal. *(Follow-up fix verified in browser automation: returns to the Customize trigger when it still exists in the DOM.)*
- [x] Confirm the session preferences panel receives focus on open. *(Follow-up fix verified in browser automation: focus now moves into the non-modal dialog surface on open.)*

## Focus Visibility

- [x] Confirm every interactive control has a clearly visible focus indicator in both dark and light mode.
- [x] Confirm focus remains visible on icon-only controls and segmented/tab controls.

## Labels and Icon-Only Controls

- [x] Confirm icon-only buttons have a clear accessible name and understandable visible purpose.
- [x] Confirm the theme toggle is clearly labeled and understandable.
- [x] Confirm the copy link control is clearly labeled and understandable.
- [x] Confirm the leave room control is clearly labeled and understandable.
- [x] Confirm the moderator transfer controls are clearly labeled and understandable.

## Contrast Sanity

- [x] Review the main flows in both dark and light mode.
- [x] Confirm helper text, badges, chips, banners, and results metrics remain readable.
- [x] Confirm focus outlines and status indicators remain visible against their surfaces.

## Zoom and Narrow Viewports

- [x] Check the landing page, deck modal, pre-reveal room, and revealed room at `200%` zoom.
- [x] Check the same flows at a narrow viewport around `320px` wide.
- [x] Confirm there is no broken layout, clipped controls, or hidden primary action.
- [x] Confirm text scaling at `200%` root font-size causes no overflow or content loss.

## Reduced Motion and Forced Colors

- [x] Confirm `prefers-reduced-motion: reduce` disables all animations and transitions. *(Universal selector rule verified in CSS.)*
- [x] Confirm `forced-colors: active` handles gradient-text headings. *(Code review: heading fallback present.)*
- [x] Confirm `forced-colors: active` includes fallback styling for vote cards, status badges, and progress bars. *(Chromium forced-colors emulation verified after follow-up; actual Windows rendering still needs validation.)*
- [ ] Verify forced-colors rendering on actual Windows High Contrast mode. *(Not tested — requires Windows.)*

## Speech-Input Readiness

- [x] Confirm all form controls have associated labels matching visible text.
- [x] Confirm primary action buttons have accessible names containing their visible text.
- [x] Confirm "Live" label on narrow screens is contained in the session preferences button aria-label. *(Follow-up fix verified in narrow-screen browser automation.)*

## Still Requires Deeper Manual Validation

- [ ] Run [Screen Reader Checklist](./docs/a11y/screen-reader-checklist.md) with VoiceOver on macOS.
- [ ] Run [Screen Reader Checklist](./docs/a11y/screen-reader-checklist.md) with VoiceOver on iOS.
- [ ] Run [Screen Reader Checklist](./docs/a11y/screen-reader-checklist.md) with TalkBack on Android.
- [ ] Run [Screen Reader Checklist](./docs/a11y/screen-reader-checklist.md) with NVDA or JAWS on Windows.
- [ ] Run [Windows High Contrast Checklist](./docs/a11y/windows-high-contrast-checklist.md) on real Windows.
- [ ] Run [Speech Input Checklist](./docs/a11y/speech-input-checklist.md) with real speech-input software.
- [ ] Complete [AAA Contrast Signoff Matrix](./docs/a11y/aaa-contrast-signoff-matrix.md) with real measurements and evidence.
