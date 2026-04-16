# Security scanning

YASP runs a layered set of scanners using GitHub-native security
features and a few low-maintenance open-source tools. Everything here
is either part of free GitHub Advanced Security for public repos or
self-hosted in CI — no paid SaaS, no external tokens to rotate.

## Post-remediation status

As of commit `73babea`, the code-fixable GitHub code scanning backlog from the
2026-04-16 remediation pass is complete. The remaining open alerts are not
runtime-code defects in the shipped app; they are repo settings, maintainer
process, or dismissal candidates.

| Alert | Rule | Classification | Action |
|---|---|---|---|
| `#1` | `BranchProtectionID` | repo/settings issue | enable a `main` branch ruleset |
| `#44` | `CodeReviewID` | process/policy issue | require PR review and stop direct pushes |
| `#45` | `FuzzingID` | process/policy issue | optional future work; not a current code defect |
| `#43` | `CIIBestPracticesID` | process/policy issue | optional posture work; not a runtime defect |
| `#46` | `MaintainedID` | acceptable risk / heuristic-only | dismiss with recorded rationale below |
| `#52` | `js/biased-cryptographic-random` | false positive | dismiss with recorded rationale below |

### Maintainer checklist for remaining governance alerts

The full ruleset, required-checks list, and merge-queue guidance lives in
[`docs/branch-protection.md`](./branch-protection.md). The short version:

- Open GitHub **Settings → Rules → Rulesets → New branch ruleset** and target
  `refs/heads/main`.
- Enable **Block force pushes** and **Restrict deletions** for `main`.
- Enable **Require a pull request before merging** with at least `1`
  approval, dismiss stale approvals, and require approval of the most recent
  reviewable push.
- Enable **Require status checks to pass before merging** and select the
  blocking checks listed in
  [`docs/branch-protection.md`](./branch-protection.md#required-status-checks-blocking-lanes).
- Apply the ruleset to administrators too unless there is a deliberate,
  documented bypass policy.
- Stop pushing human changes directly to `main`; merge through reviewed pull
  requests only.
- Merge queue stays optional; turn it on only if `main` starts breaking from
  serial-merge races.

### Recorded dismissal rationale text

Use the exact text below if those alerts remain open after rescans.

#### `#52` `js/biased-cryptographic-random`

```text
False positive. server/src/utils/id.ts maps randomBytes() output into a 32-character alphabet (ABCDEFGHJKLMNPQRSTUVWXYZ23456789). Because 256 is evenly divisible by 32, byte % 32 is uniform here and does not introduce modulo bias. The current implementation does not have the reported cryptographic bias issue.
```

#### `#46` `MaintainedID`

```text
Acceptable risk / heuristic-only finding. This repository was created on 2026-03-25 and is still within Scorecard's first-90-days window, so the alert is driven solely by repository age rather than an outstanding code or configuration defect. The project is actively maintained, and this check should age out automatically once the repository is older than 90 days.
```

## Merge blockers today

These checks currently fail the PR when they fail.

| Check | Workflow | Gate |
|---|---|---|
| Validate (build, test, lint, format, i18n) | `ci.yml` → `validate` | any failure |
| CodeQL (JS/TS, `security-extended`) | `codeql.yml` | any security finding |
| Docker build + health check | `ci.yml` → `docker-validation` | any failure |
| Accessibility smoke | `ci.yml` → `a11y-smoke` | any failure |
| CDK synth (when `cdk/` changed) | `ci.yml` → `cdk-synth` | any failure |

## Advisory checks today

These run in CI and stay visible in the PR summary or security dashboards, but
they are intentionally non-blocking until the stated promotion condition is
met.

| Check | Workflow | Current status | Promotion condition |
|---|---|---|---|
| Dependency review | `dependency-review.yml` | advisory | enable GitHub **Dependency graph** under Settings → Code security and analysis, then remove `continue-on-error` |
| Trivy filesystem + IaC + secret scan | `trivy.yml` → `repo-scan` | advisory | burn down existing `HIGH` / `CRITICAL` baseline findings, then remove `continue-on-error` |
| Trivy container image scan | `trivy.yml` → `image-scan` | advisory | burn down existing `HIGH` / `CRITICAL` image findings, then remove `continue-on-error` |
| `npm audit --omit=dev --audit-level=high` | `ci.yml` → `validate` → `npm-audit` step | advisory | keep clean enough at `high` / `critical` to make the step blocking |
| ESLint strict (type-aware `no-unsafe-*`) | `lint-strict.yml` | advisory | get `npm run lint:strict` clean on `main` |
| Knip (unused files/exports/deps) | `knip.yml` | advisory | tune `knip.json` to zero meaningful false positives |
| OSSF Scorecard | `scorecard.yml` | advisory | likely stays advisory; it is posture evidence, not a release gate |

In practice:

- the repo already has layered security coverage in CI
- not every security lane is a merge blocker yet by design

## Planned promotion order for advisory lanes

Advisory checks should only become blocking after they stay low-noise long
enough to be dependable merge gates.

For the newer repo-managed advisory lanes, the promotion order is:

1. `npm audit --omit=dev --audit-level=high`
2. `npm run lint:strict`
3. `npm run knip`

OSSF Scorecard stays advisory. It is useful posture evidence, but it is not a
good merge blocker for day-to-day PRs.

Dependency Review and Trivy remain advisory for now too, but they are governed
by their own prerequisites:

- Dependency Review first needs GitHub Dependency Graph enabled and stable
- Trivy first needs the current `HIGH` / `CRITICAL` baseline burned down

Those two lanes should not be treated as part of the immediate blocker rollout
order above.

## Scheduled sweeps

Several scanners run on a weekly cron so newly published advisories
surface against already-merged code without waiting for someone to
open a PR.

| Workflow | Cadence | Purpose |
|---|---|---|
| `codeql.yml` | Monday 06:00 UTC | Re-scan `main` against latest query pack. |
| `trivy.yml` | Monday 07:00 UTC | Re-scan filesystem + image against fresh vulnerability DB. |
| `scorecard.yml` | Wednesday 08:00 UTC | Refresh posture score + publish to public Scorecards dataset. |
| Dependabot npm / actions / docker | Weekly | Grouped patch/minor PRs for root workspaces, `cdk/`, GitHub Actions, Dockerfile base image. |

## GitHub secret scanning

Secret scanning and push protection are enabled at the repo level
under **Settings → Code security and analysis**. These are GitHub-
native, not part of any workflow in this repo:

- **Secret scanning** — GitHub inspects every push and every pull
  request for known credential formats (AWS access keys, GitHub
  tokens, npm publish tokens, Docker Hub PATs, etc.). Matches surface
  under **Security → Secret scanning alerts** and trigger partner
  revocation where supported.
- **Push protection** — when enabled, pushes that introduce a new
  secret of a supported type are rejected at the git transport layer
  before they reach the repository. A contributor who sees the block
  must either rotate the credential or bypass the block with a typed
  justification.
- **Trivy's `secret` scanner** in `trivy.yml` runs as belt-and-braces
  coverage for secret formats GitHub does not recognize (e.g. custom
  internal token shapes).

To verify the repo-level toggles:

```
gh api -H "Accept: application/vnd.github+json" \
  /repos/:owner/:repo \
  --jq '{secret_scanning: .security_and_analysis.secret_scanning.status,
         push_protection: .security_and_analysis.secret_scanning_push_protection.status}'
```

Expected output:

```json
{"secret_scanning": "enabled", "push_protection": "enabled"}
```

If either is `disabled`, flip it on from the repository settings UI.
There is no workflow knob for these — they live in repo settings.

## Dependabot surface

`dependabot.yml` configures four ecosystems:

- **npm (root)** — covers `shared/`, `server/`, and `client/` via the
  single root `package-lock.json` that npm workspaces maintains.
  Grouped into `production` and `dev` to keep PR volume sane.
- **npm (`cdk/`)** — separate entry because the CDK app ships its own
  lockfile. Grouped so `aws-cdk-lib` + `constructs` + `aws-cdk` land
  together.
- **github-actions** — pins third-party actions to the latest
  version.
- **docker** — bumps the Dockerfile base image.

Several majors are deliberately pinned in `dependabot.yml`:
`eslint` and friends (`eslint-plugin-jsx-a11y` peer range),
`react` / `react-dom` / i18n (React 19 migration is its own work),
and `eslint-plugin-react-hooks` (pre-existing rule fallout). Minor
and patch updates still flow. Each pin documents its removal
condition inline.

## Dependabot auto-merge policy

YASP uses a separate conservative workflow,
[`dependabot-automerge.yml`](../.github/workflows/dependabot-automerge.yml),
that only **enables GitHub auto-merge** for low-risk Dependabot PRs.

Important boundaries:

- it only runs for `dependabot[bot]` PRs
- it does **not** merge directly
- it does **not** bypass branch protection
- required checks still decide whether GitHub actually merges

Current allowlist:

| PR type | Auto-merge eligible? | Notes |
|---|---|---|
| GitHub Actions update, patch/minor, single dependency | yes | only if the PR avoids risky paths |
| npm devDependency update, patch/minor, single dependency | yes | only if the package is not denylisted |
| Dependabot security update, patch/minor, single dependency | yes | only if the package/path is not excluded |
| Major update | no | always manual |
| Docker ecosystem update | no | always manual |
| Any PR touching `cdk/` | no | always manual |
| Any PR touching deploy workflows | no | always manual |
| Grouped / multi-dependency PR | no | stays manual for now |

Excluded dependency categories:

- React / React DOM
- Vite
- Vitest
- TypeScript
- ESLint and the major lint stack (`eslint`, `@eslint/*`, `@typescript-eslint/*`, `eslint-plugin-*`)
- `i18next` / `react-i18next`
- Fastify core packages (`fastify`, `@fastify/*`)
- Socket.IO core/runtime packages (`socket.io`, `socket.io-client`, `@socket.io/*`)

Excluded paths:

- `cdk/**`
- `Dockerfile`
- `.github/workflows/deploy-aws.yml`
- `.github/workflows/docker-publish.yml`

This is intentionally conservative because the repo has recent history of bot
PRs breaking lint, tests, and build. Coverage can expand later, but only after
the false-positive and breakage rate stays low.

## Triage workflow

1. **Alert lands** — SARIF uploads route CodeQL, Trivy, and Scorecard
   findings into **Security → Code scanning**; Dependabot and
   Dependency Review findings land in **Security → Dependabot**;
   secret scanning lands in **Security → Secret scanning**.
2. **Assess severity** — honor the gate: high/critical get same-week
   action, medium/low get queued alongside Dependabot PRs.
3. **Suppress false positives at the scanner config level**, not by
   deleting code. CodeQL supports query suppression; Trivy supports
   `.trivyignore`; Knip config lives in `knip.json`.
4. **Record decisions** — if a finding is accepted-risk, add a bullet
   to the relevant plan doc (e.g. `SECURITY_REMEDIATION_PLAN.md`) or
   an ADR under `plans/decisions/`.

## Local runs

The scanners that matter for iteration are all runnable locally:

```
npm run lint            # default lint (blocking in CI)
npm run lint:strict     # type-aware unsafe-* rules (advisory in CI)
npm run knip            # unused files/exports/deps
npm test                # unit + integration tests
npm audit --omit=dev --audit-level=high
```

CodeQL, Trivy, and Scorecard are heavier and are expected to run in
CI only. Trivy can be run locally with `trivy fs .` and
`trivy image yasp:dev` if you want to reproduce a CI finding.
