# AAA Contrast Signoff Matrix

This file is a signoff template and workflow, not a claim that AAA contrast work is complete.

Use it to document real contrast measurements and rendered-state review across YASP’s major components.

## How to Use This Matrix

1. Review both dark and light themes.
2. Measure real rendered states where possible, not just token guesses.
3. Record the exact foreground/background pair actually observed.
4. Capture a screenshot reference for each measured item.
5. Mark `Needs follow-up` when measurement is uncertain or state-specific rendering differs from the token expectation.

## Measurement Workflow

1. Pick the YASP state and theme.
2. Capture a screenshot reference before measuring.
3. Measure the real rendered pair with a trusted contrast tool.
4. Record whether the value reflects:
   - rendered UI measurement
   - token/design review only
5. If the rendered state varies by interaction, measure the hardest state separately.

Recommended measurement tools:

- browser devtools color picker / contrast helper
- trusted desktop contrast analyzer
- design-token review as supporting evidence only

## YASP States to Cover

- landing page
- landing page modal
- room page pre-reveal
- room page revealed/results
- moderator controls
- participant board
- session preferences surface
- banners / empty states / manual join state

## Measurement Fields

| Field | Description |
| --- | --- |
| Component / state | Exact YASP surface, e.g. `vote card selected`, `results distribution label` |
| Theme | `dark` or `light` |
| Text size category | normal / large / icon / non-text contrast review |
| Foreground token/color | actual measured foreground |
| Background token/color | actual measured background |
| WCAG target | expected target, typically AAA |
| Measured ratio | actual ratio from tool |
| Pass / Fail / Needs follow-up | result |
| Screenshot reference | evidence path |
| Notes | context, exceptions, remediation |

## Signoff Matrix

| Component / state | Theme | Text size | Foreground | Background | WCAG target | Ratio | Result | Screenshot | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Primary heading | dark | large | | | AAA | | | | |
| Primary heading | light | large | | | AAA | | | | |
| Secondary/helper text | dark | normal | | | AAA | | | | |
| Secondary/helper text | light | normal | | | AAA | | | | |
| Utility trigger label | dark | normal | | | AAA | | | | |
| Utility trigger label | light | normal | | | AAA | | | | |
| Chips / badges | dark | normal | | | AAA | | | | |
| Chips / badges | light | normal | | | AAA | | | | |
| Transfer helper text | dark | normal | | | AAA | | | | |
| Transfer helper text | light | normal | | | AAA | | | | |
| Disabled text / controls | dark | normal | | | AAA or documented exception | | | | |
| Disabled text / controls | light | normal | | | AAA or documented exception | | | | |
| Vote card unselected | dark | normal | | | AAA | | | | |
| Vote card selected | dark | normal | | | AAA | | | | |
| Vote card unselected | light | normal | | | AAA | | | | |
| Vote card selected | light | normal | | | AAA | | | | |
| Timer readout | dark | large | | | AAA | | | | |
| Timer readout | light | large | | | AAA | | | | |
| Moderator timer/status copy | dark | normal | | | AAA | | | | |
| Moderator timer/status copy | light | normal | | | AAA | | | | |
| Results key metrics | dark | large | | | AAA | | | | |
| Results key metrics | light | large | | | AAA | | | | |
| Distribution count pill | dark | normal | | | AAA | | | | |
| Distribution count pill | light | normal | | | AAA | | | | |
| Results distribution labels | dark | normal | | | AAA | | | | |
| Results distribution labels | light | normal | | | AAA | | | | |
| Participant card name text | dark | normal | | | AAA | | | | |
| Participant card name text | light | normal | | | AAA | | | | |
| Participant card status text | dark | normal | | | AAA | | | | |
| Participant card status text | light | normal | | | AAA | | | | |
| Session preferences text | dark | normal | | | AAA | | | | |
| Session preferences text | light | normal | | | AAA | | | | |
| Banner / error text | dark | normal | | | AAA | | | | |
| Banner / error text | light | normal | | | AAA | | | | |
| Modal secondary copy | dark | normal | | | AAA | | | | |
| Modal secondary copy | light | normal | | | AAA | | | | |
| Focus indicator on primary button | dark | non-text | | | AAA / non-text contrast review | | | | |
| Focus indicator on primary button | light | non-text | | | AAA / non-text contrast review | | | | |
| Focus indicator on vote card | dark | non-text | | | AAA / non-text contrast review | | | | |
| Focus indicator on vote card | light | non-text | | | AAA / non-text contrast review | | | | |
| Focus indicator on input/select | dark | non-text | | | AAA / non-text contrast review | | | | |
| Focus indicator on input/select | light | non-text | | | AAA / non-text contrast review | | | | |
| Focus indicator on utility trigger | dark | non-text | | | AAA / non-text contrast review | | | | |
| Focus indicator on utility trigger | light | non-text | | | AAA / non-text contrast review | | | | |

## Reviewer Notes

- If a component has multiple states, measure the most difficult state separately.
- If non-text contrast is the real concern, record that explicitly in `Notes`.
- If a token-level review and rendered-state review disagree, the rendered-state result wins.
- Do not mark the matrix complete until all major YASP states above have at least one reviewed screenshot and measurement entry.
