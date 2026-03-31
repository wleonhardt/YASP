# YASP Accessibility Audit: WCAG 2.2 AAA Status

## Scope

This document tracks the current accessibility status of YASP against the latest stable W3C recommendation, [WCAG 2.2](https://www.w3.org/TR/WCAG22/), with **AAA** as the target conformance level.

It reflects the current codebase after the semantic, contrast, focus, motion, modal, and keyboard remediation passes completed through March 29, 2026, and a manual accessibility QA pass on March 31, 2026.

## Current Assessment

### Summary

YASP is in a substantially better accessibility state than the original audit baseline.

Current evidence shows:

- no known automated WCAG A/AA violations in the tested core flows
- no known responsive overflow issues in the tested landing, modal, manual-join, pre-reveal, and revealed states
- materially improved semantics, labeling, keyboard behavior, live announcements, reduced-motion support, and forced-colors resilience

YASP should still **not** be claimed as WCAG 2.2 AAA conformant yet.

The main reason is no longer obvious code-level failure in the tested flows. The remaining gap is proof: manual assistive-technology and edge-environment validation is still required before making an A/AA or AAA conformance claim with confidence.

### Practical status

- **Automated/browser status:** clean in tested states
- **Code-level remediation status:** major baseline findings addressed
- **Formal WCAG AAA claim:** not yet supportable
- **Main remaining work:** manual validation and conformance proof

## Manual Validation Package

The remaining manual work now has a dedicated validation package:

- [ACCESSIBILITY_MANUAL_VALIDATION_PLAN.md](/Users/william/Projects/yasp/ACCESSIBILITY_MANUAL_VALIDATION_PLAN.md)
- [Windows High Contrast Checklist](/Users/william/Projects/yasp/docs/a11y/windows-high-contrast-checklist.md)
- [Screen Reader Checklist](/Users/william/Projects/yasp/docs/a11y/screen-reader-checklist.md)
- [Speech Input Checklist](/Users/william/Projects/yasp/docs/a11y/speech-input-checklist.md)
- [AAA Contrast Signoff Matrix](/Users/william/Projects/yasp/docs/a11y/aaa-contrast-signoff-matrix.md)
- [Evidence Template](/Users/william/Projects/yasp/docs/a11y/evidence-template.md)

These documents are the authoritative workflow for the remaining specialist validation. They are intentionally evidence-oriented and do not imply that the validations are already complete.

## What Has Been Remediated

These items were identified in the original baseline audit and have since been addressed in code.

### Semantics and structure

- landing-page form fields now have proper accessible labeling
- role selectors expose radio-group semantics and keyboard behavior
- the icon-only GitHub link now has an accessible name
- landing and room views now expose proper `main` landmarks
- major room panels now expose clearer section naming
- the room page now has a page-level heading structure and route-aware document titles
- copy-link naming now aligns better with visible text

### Live updates and interaction behavior

- room-state changes now announce through dedicated live-region behavior
- moderator-only controls use visible hints and `aria-describedby` instead of relying on `title`
- toast timing was lengthened to be less easy to miss
- the deck customization modal now supports focus trapping, `Escape` close, backdrop close, and keyboard-operable tab behavior

### Visual accessibility and adaptability

- reduced-motion support is present
- forced-colors fallback is present for gradient heading treatments, vote cards, chips/badges, and progress indicators
- focus-visible styling is stronger and more explicit than the original baseline
- dark/light theme tokens were adjusted to improve contrast robustness relative to the initial audit
- the coffee card now uses a scalable SVG icon rather than an emoji glyph dependency

### Follow-up remediation after the 2026-03-31 manual QA pass

- deck customize modal now restores focus to the opening trigger when that trigger still exists
- session preferences now moves focus into the dialog surface on open while remaining non-modal
- the responsive session-preferences trigger accessible name now includes the visible narrow-screen label ("Live")
- forced-colors fallback coverage was extended beyond headings to vote cards, chips/badges, and progress bars
- a post-remediation browser verification pass confirmed the modal/session-preferences fixes and validated the forced-colors fallback under Chromium forced-colors emulation

## Latest Verification Evidence

## 1. Automated and browser-based checks

A fresh verification run against the current build found:

- **0 axe violations**
- **0 horizontal overflow issues**

Tested states:

- landing page
- landing page with deck customization modal open
- manual join state
- room page pre-reveal
- room page revealed/results state

Tested sizes and themes included:

- dark desktop `1440x900`
- light desktop `1280x900`
- dark mobile `390x844`
- light mobile `390x844`
- light small mobile `320x568`

Artifacts from the latest browser pass are stored under:

- `/Users/william/Projects/yasp/tmp/a11y-audit`

## 2. Manual accessibility QA pass (2026-03-31)

A comprehensive manual accessibility QA pass was completed via browser automation. Full report: `tmp/ACCESSIBILITY-MANUAL-QA-REPORT.md`.

**Validated and passing:**

- keyboard-only walkthrough of landing page and room page (all controls reachable, logical tab order)
- role selector radiogroup with roving tabindex and arrow-key navigation
- deck customize modal: focus trap, Escape close, `aria-modal="true"`, `aria-labelledby`
- session preferences non-modal dialog: Escape close, focus return to trigger, `aria-haspopup="dialog"`
- focus visibility in dark mode (`rgb(106, 173, 255)` 2px outline) and light mode (`rgb(20, 80, 158)` 2px outline)
- zoom/reflow at 320px (400% equivalent) and 640px (200% equivalent) — no horizontal overflow
- text scaling at 200% root font-size — no overflow or content loss
- `prefers-reduced-motion: reduce` universal selector rule verified
- `forced-colors: active` heading fallback verified (code review)
- all form controls have associated labels
- label-in-name alignment verified for all primary controls

**Issues found during the QA pass:**

- deck customize modal focus return went to `<body>` instead of the Customize trigger button
- session preferences panel did not move focus into the panel on open
- "Live" visible label on narrow screens was not contained in the session preferences `aria-label`
- forced-colors CSS coverage was limited to headings

**Status after targeted follow-up remediation and post-fix verification:**

- the modal focus-return issue is fixed and browser-verified
- the session-preferences initial focus issue is fixed and browser-verified
- the "Live" label-in-name gap is fixed and browser-verified on a narrow viewport
- forced-colors fallback coverage is improved and verified in Chromium forced-colors emulation, but real Windows High Contrast rendering still requires manual validation

## 3. Earlier interaction-specific verification

Additional browser checks confirmed:

- radio-group keyboard behavior for role selectors
- tablist keyboard behavior for deck-customization tabs
- modal focus trap behavior under repeated `Tab`
- `Escape` closing for the modal
- `prefers-reduced-motion: reduce` behavior in the current UI
- `forced-colors: active` fallback for gradient text

## 3. Repository quality gates

The current repository also has working quality gates that reduce regression risk:

- `npm run lint`
- `npm run format:check`
- `npm test`
- `npm run build`

CI additionally validates:

- build
- tests
- ESLint
- Prettier
- Docker smoke test
- `cdk synth` when `cdk/` changes

## Remaining Gaps Before a Conformance Claim

These are the items that still keep YASP from being responsibly described as WCAG 2.2 AAA conformant.

## 1. Manual assistive-technology validation is still incomplete

**Status:** Open  
**Why it matters:** automated tooling cannot prove real usability with assistive technologies.

Execution workflow:

- [Screen Reader Checklist](/Users/william/Projects/yasp/docs/a11y/screen-reader-checklist.md)
- [Evidence Template](/Users/william/Projects/yasp/docs/a11y/evidence-template.md)

Still needed:

- VoiceOver on macOS
- VoiceOver on iOS
- TalkBack on Android
- ideally NVDA or JAWS on Windows as an additional desktop screen-reader pass

Areas to verify manually:

- room-state announcements
- modal behavior and focus return
- radio-group and tablist discoverability
- moderator controls and disabled-state explanations
- results panel comprehension and reading order

## 2. Real speech-input validation

**Status:** Code-level label matching validated; real speech-input validation still open
**Likely criteria impacted:** WCAG 2.5.3

Execution workflow:

- [Speech Input Checklist](/Users/william/Projects/yasp/docs/a11y/speech-input-checklist.md)
- [Evidence Template](/Users/william/Projects/yasp/docs/a11y/evidence-template.md)

A programmatic label-in-name audit was completed across all interactive elements on both landing and room pages. All primary controls have accessible names that contain their visible text.

The previously identified narrow-screen "Live" gap in the session preferences trigger was remediated in follow-up code, so the current code-level state is aligned.

Still needed:

- validate with real speech-input software (Dragon NaturallySpeaking, macOS Voice Control)

## 3. Zoom and reflow

**Status:** Validated (2026-03-31)

Manual testing confirmed no horizontal overflow or content loss at:

- 640px viewport (200% zoom equivalent)
- 320px viewport (400% zoom equivalent / WCAG 1.4.10 Reflow target)
- 200% root font-size scaling

Tested pages: landing page, room page. All content reflows to single column, header elements adapt (icon-only buttons, abbreviated labels), timer collapses to disclosure, vote cards adjust grid columns. `scrollWidth === clientWidth` confirmed programmatically at 320px on both pages.

## 4. AAA contrast needs complete state-by-state manual signoff

**Status:** Open  
**Why it matters:** representative token fixes and browser checks are encouraging, but AAA claims require a very high standard.

Execution workflow:

- [AAA Contrast Signoff Matrix](/Users/william/Projects/yasp/docs/a11y/aaa-contrast-signoff-matrix.md)
- [Evidence Template](/Users/william/Projects/yasp/docs/a11y/evidence-template.md)

The current design system is materially improved, but a complete contrast matrix has not been documented across every text size/state combination, including:

- muted helper text on every surface
- chips and badges in both themes
- disabled states
- results metrics and distribution labels
- modal secondary copy
- focus indicators against all backgrounds

## 5. Real Windows High Contrast review is still incomplete

**Status:** Open  
**Why it matters:** Chromium forced-colors emulation is supporting evidence, not a substitute for Windows High Contrast validation.

Execution workflow:

- [Windows High Contrast Checklist](/Users/william/Projects/yasp/docs/a11y/windows-high-contrast-checklist.md)
- [Evidence Template](/Users/william/Projects/yasp/docs/a11y/evidence-template.md)

Still needed:

- at least one real Windows High Contrast pass in Edge or Chrome
- screenshots of the key YASP states
- explicit notes on selected states, chips/badges, progress bars, focus visibility, and disabled states

## 6. Cognitive and timing comfort still need human review

**Status:** Partially addressed (2026-03-31)
**Why it matters:** WCAG conformance is not only about semantic correctness.

Validated:
- reduced-motion CSS uses universal selector to disable all animations/transitions (gold standard approach)
- room layout remains clear under 200% text magnification (confirmed via font-size scaling test)

Still needed:
- confirm toast timing remains reasonable in real use
- confirm live-region announcements are informative without becoming noisy
- confirm state transitions remain understandable under reduced motion with real user flow timing

## Current Risk Statement

Based on the current code and automated/browser evidence:

- there are **no currently known automated A/AA blockers** in the tested flows
- there are **no currently known responsive overflow defects** in the tested flows
- there are still **unverified manual conformance areas**, especially for AAA and assistive-technology behavior

That means the current status is best described as:

> YASP has completed a substantial accessibility remediation pass and currently tests clean in its core flows, but it still requires manual assistive-technology validation, real Windows High Contrast review, real speech-input validation, and AAA contrast signoff before any WCAG 2.2 A/AA/AAA conformance claim should be made.

## Files Most Relevant to Accessibility

Key files touched by the remediation work include:

- `/Users/william/Projects/yasp/client/src/routes/LandingPage.tsx`
- `/Users/william/Projects/yasp/client/src/routes/RoomPage.tsx`
- `/Users/william/Projects/yasp/client/src/components/DeckCustomizeModal.tsx`
- `/Users/william/Projects/yasp/client/src/components/ModeratorControls.tsx`
- `/Users/william/Projects/yasp/client/src/components/ParticipantsBoard.tsx`
- `/Users/william/Projects/yasp/client/src/components/ResultsPanel.tsx`
- `/Users/william/Projects/yasp/client/src/components/ThemeToggle.tsx`
- `/Users/william/Projects/yasp/client/src/components/TopBar.tsx`
- `/Users/william/Projects/yasp/client/src/components/VoteDeck.tsx`
- `/Users/william/Projects/yasp/client/src/components/ConnectionBadge.tsx`
- `/Users/william/Projects/yasp/client/src/hooks/useDocumentTitle.ts`
- `/Users/william/Projects/yasp/client/src/lib/rovingFocus.ts`
- `/Users/william/Projects/yasp/client/src/styles/globals.css`
- `/Users/william/Projects/yasp/client/src/styles/theme.css`

## Verification Checklist

Before claiming conformance, complete this list:

- ~~keyboard-only walkthrough of all landing, modal, room, moderator, and reconnect flows~~ ✅ (2026-03-31)
- ~~zoom/reflow at `200%` and `400%`~~ ✅ (2026-03-31)
- ~~speech-input label matching~~ ✅ code-level validation complete after follow-up remediation
- ~~focus visibility in both themes~~ ✅ (2026-03-31)
- VoiceOver on macOS
- VoiceOver on iOS
- TalkBack on Android
- NVDA or JAWS on Windows
- high-contrast / forced-colors review beyond the current smoke test (requires Windows)
- complete the manual validation package under [ACCESSIBILITY_MANUAL_VALIDATION_PLAN.md](/Users/william/Projects/yasp/ACCESSIBILITY_MANUAL_VALIDATION_PLAN.md)
- reduced-motion review with real user flow timing
- AAA contrast ratio documentation for all text/background combinations
- ~~fix deck modal focus return~~ ✅ remediated in follow-up code pass
- ~~fix "Live" label gap in session preferences aria-label~~ ✅ remediated in follow-up code pass

## Conclusion

YASP is no longer in the same state as the original audit baseline. The codebase now has significantly stronger accessibility foundations, and the latest automated/browser verification passes are clean.

The remaining work is narrower and more disciplined:

- finish manual assistive-technology validation
- finish real Windows High Contrast and speech-input validation
- document final contrast/focus signoff carefully

Until that is complete, YASP should be presented as **actively accessibility-improved and under ongoing WCAG 2.2 AAA review**, not as fully conformant.
