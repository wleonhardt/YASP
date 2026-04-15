# Security scanning

YASP runs a layered set of scanners using GitHub-native security
features and a few low-maintenance open-source tools. Everything here
is either part of free GitHub Advanced Security for public repos or
self-hosted in CI — no paid SaaS, no external tokens to rotate.

## Blocking checks (merge-gated)

These are hard gates on pull requests. A finding at or above the
listed severity fails the job and blocks merge.

| Check | Workflow | Gate |
|---|---|---|
| Validate (build, test, lint, format, i18n) | `ci.yml` → `validate` | any failure |
| Dependency review | `dependency-review.yml` | new dep at `high` or `critical` GHSA severity |
| CodeQL (JS/TS, `security-extended`) | `codeql.yml` | any security finding |
| Trivy filesystem + IaC + secret scan | `trivy.yml` → `repo-scan` | `HIGH` or `CRITICAL`, fixed versions only |
| Trivy container image scan | `trivy.yml` → `image-scan` | `HIGH` or `CRITICAL`, fixed versions only |
| Docker build + health check | `ci.yml` → `docker-validation` | any failure |
| Accessibility smoke | `ci.yml` → `a11y-smoke` | any failure |
| CDK synth (when `cdk/` changed) | `ci.yml` → `cdk-synth` | any failure |

## Advisory checks (visible, non-blocking)

These run on every PR but are allowed to fail without blocking merge.
Their output appears in the PR check summary. Each of them has an
explicit promotion path described in its workflow comments.

| Check | Workflow | Why advisory |
|---|---|---|
| `npm audit --omit=dev --audit-level=high` | `ci.yml` → `validate` → `npm-audit` step | Newly published advisories must not red a PR before triage. |
| ESLint strict (type-aware `no-unsafe-*`) | `lint-strict.yml` | Pre-existing any-flavored patterns need incremental burn-down before strict lint becomes a gate. |
| Knip (unused files/exports/deps) | `knip.yml` | Knip regularly flags intentionally-unused internal API surface; promote after the config is tuned to zero false positives. |
| OSSF Scorecard | `scorecard.yml` | Scorecard is a posture *signal*, not a release gate. |

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
