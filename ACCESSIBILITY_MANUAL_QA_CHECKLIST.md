# Accessibility Manual QA Checklist

Use this checklist for release-facing accessibility sanity checks. It complements automated lint and axe smoke tests; it does not replace assistive-technology validation.

## Keyboard Navigation

- [ ] Confirm the landing page can be used without a mouse.
- [ ] Confirm `Create room`, `Join room`, deck selection, and role selection all work with keyboard only.
- [ ] Confirm room actions, vote cards, transfer-host controls, and leave/copy/theme controls are reachable in a logical order.

## Modal Behavior

- [ ] Open the deck customization modal.
- [ ] Confirm focus moves into the modal on open.
- [ ] Confirm `Tab` and `Shift+Tab` stay trapped inside the modal.
- [ ] Confirm `Escape` closes the modal.
- [ ] Confirm focus returns to the control that opened the modal.

## Focus Visibility

- [ ] Confirm every interactive control has a clearly visible focus indicator in both dark and light mode.
- [ ] Confirm focus remains visible on icon-only controls and segmented/tab controls.

## Labels and Icon-Only Controls

- [ ] Confirm icon-only buttons have a clear accessible name and understandable visible purpose.
- [ ] Check at minimum:
  - theme toggle
  - copy link
  - leave room
  - moderator transfer controls

## Contrast Sanity

- [ ] Review the main flows in both dark and light mode.
- [ ] Confirm helper text, badges, chips, banners, and results metrics remain readable.
- [ ] Confirm focus outlines and status indicators remain visible against their surfaces.

## Zoom and Narrow Viewports

- [ ] Check the landing page, deck modal, pre-reveal room, and revealed room at `200%` zoom.
- [ ] Check the same flows at a narrow viewport around `320px` wide.
- [ ] Confirm there is no broken layout, clipped controls, or hidden primary action.

## Still Requires Deeper Manual Validation

- [ ] screen-reader passes (VoiceOver, TalkBack, ideally NVDA/JAWS)
- [ ] speech-input label matching
- [ ] reduced-motion comfort review
- [ ] high-zoom `400%` reflow validation
