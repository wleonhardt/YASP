# YASP Accessibility Audit: WCAG 2.2 AAA Status

## Scope

This document tracks the current accessibility status of YASP against the latest stable W3C recommendation, [WCAG 2.2](https://www.w3.org/TR/WCAG22/), with **AAA** as the target conformance level.

It reflects the current codebase after the semantic, contrast, focus, motion, modal, and keyboard remediation passes completed through March 29, 2026.

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
- forced-colors fallback is present for gradient heading treatments
- focus-visible styling is stronger and more explicit than the original baseline
- dark/light theme tokens were adjusted to improve contrast robustness relative to the initial audit
- the coffee card now uses a scalable SVG icon rather than an emoji glyph dependency

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

## 2. Interaction-specific verification

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

## 2. Speech-input label matching has not been explicitly validated

**Status:** Open  
**Likely criteria impacted:** WCAG 2.5.3 confidence still needs manual proof

The visible/control label alignment work is in much better shape, but speech-input testing has not been completed across the current UI.

Still needed:

- verify that visible labels can be spoken naturally for primary controls
- verify copy-link, theme-toggle, room actions, and modal buttons specifically

## 3. Zoom and reflow need deliberate manual validation at 200% and 400%

**Status:** Open  
**Why it matters:** automated overflow checks help, but they do not replace real high-zoom review.

Still needed:

- landing page at `200%` and `400%`
- deck-customization modal at `200%` and `400%`
- room page pre-reveal and revealed states at `200%` and `400%`
- mobile narrow-width plus larger browser text-size combinations

## 4. AAA contrast needs complete state-by-state manual signoff

**Status:** Open  
**Why it matters:** representative token fixes and browser checks are encouraging, but AAA claims require a very high standard.

The current design system is materially improved, but a complete contrast matrix has not been documented across every text size/state combination, including:

- muted helper text on every surface
- chips and badges in both themes
- disabled states
- results metrics and distribution labels
- modal secondary copy
- focus indicators against all backgrounds

## 5. Cognitive and timing comfort still need human review

**Status:** Open  
**Why it matters:** WCAG conformance is not only about semantic correctness.

Still needed:

- confirm toast timing remains reasonable in real use
- confirm live-region announcements are informative without becoming noisy
- confirm state transitions remain understandable under reduced motion
- confirm the room layout remains clear under large text and magnification

## Current Risk Statement

Based on the current code and automated/browser evidence:

- there are **no currently known automated A/AA blockers** in the tested flows
- there are **no currently known responsive overflow defects** in the tested flows
- there are still **unverified manual conformance areas**, especially for AAA and assistive-technology behavior

That means the current status is best described as:

> YASP has completed a substantial accessibility remediation pass and currently tests clean in its core flows, but it still requires manual assistive-technology and high-zoom validation before any WCAG 2.2 A/AA/AAA conformance claim should be made.

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

## Verification Checklist Still To Complete

Before claiming conformance, complete this list:

- keyboard-only walkthrough of all landing, modal, room, moderator, and reconnect flows
- VoiceOver on macOS
- VoiceOver on iOS
- TalkBack on Android
- zoom/reflow at `200%` and `400%`
- speech-input label matching
- high-contrast / forced-colors review beyond the current smoke test
- reduced-motion review with real user flow timing

## Conclusion

YASP is no longer in the same state as the original audit baseline. The codebase now has significantly stronger accessibility foundations, and the latest automated/browser verification passes are clean.

The remaining work is narrower and more disciplined:

- finish manual assistive-technology validation
- finish high-zoom and speech-input validation
- document final contrast/focus signoff carefully

Until that is complete, YASP should be presented as **actively accessibility-improved and under ongoing WCAG 2.2 AAA review**, not as fully conformant.
