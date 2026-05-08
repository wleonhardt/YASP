# Security Scanning

```
  ┌──────────────────────────────────────────────────────────────────┐
  │   Layered security scanning — all GitHub-native or open-source. │
  │   No paid SaaS. No external tokens to rotate.                   │
  └──────────────────────────────────────────────────────────────────┘
```

---

## Scanning Architecture at a Glance

```
  Every PR
  ├── CodeQL (JS/TS, security-extended)          ← BLOCKING
  ├── Docker build + healthcheck                  ← BLOCKING
  ├── Validate (build · test · lint · i18n)       ← BLOCKING
  ├── Accessibility smoke (Playwright)            ← BLOCKING
  ├── CDK synth  (when cdk/ changes)              ← BLOCKING
  ├── npm audit (high/critical)                  ← advisory → planned blocker
  ├── ESLint strict  (type-aware unsafe-*)        ← advisory → planned blocker
  ├── Knip (unused files/exports/deps)            ← advisory → planned blocker
  ├── Dependency Review                           ← advisory
  └── Trivy (filesystem + IaC + secrets)          ← advisory

  Weekly cron
  ├── CodeQL re-scan of main  (Mon 06:00 UTC)
  ├── Trivy re-scan  (Mon 07:00 UTC)
  ├── OSSF Scorecard refresh  (Wed 08:00 UTC)
  └── Dependabot (npm · actions · docker)  grouped PRs
```

---

## Post-Remediation Status

As of commit `73babea`, the code-fixable GitHub code scanning backlog from
the 2026-04-16 remediation pass is complete. Remaining open alerts are
repo settings, maintainer process, or dismissal candidates — not runtime
defects.

| Alert | Rule | Classification | Action |
|---|---|---|---|
| `#1` | `BranchProtectionID` | repo/settings issue | enable a `main` branch ruleset |
| `#44` | `CodeReviewID` | process/policy issue | require PR review, stop direct pushes |
| `#45` | `FuzzingID` | process/policy issue | optional future work |
| `#43` | `CIIBestPracticesID` | process/policy issue | optional posture work |
| `#46` | `MaintainedID` | acceptable risk / heuristic-only | dismiss — see rationale below |
| `#52` | `js/biased-cryptographic-random` | false positive | dismiss — see rationale below |

### Maintainer Checklist for Governance Alerts

Full branch ruleset guidance lives in [`docs/branch-protection.md`](./branch-protection.md). Short version:

- Open **Settings → Rules → Rulesets → New branch ruleset**, target `refs/heads/main`
- Enable **Block force pushes** and **Restrict deletions**
- Enable **Require a pull request** with ≥ 1 approval, dismiss stale approvals
- Enable **Require status checks to pass** with the blocking checks listed in branch-protection.md
- Apply the ruleset to administrators too unless there is a documented bypass policy
- Stop pushing directly to `main` — merge through reviewed pull requests only

### Dismissal Rationale

Use these exact texts if those alerts remain open after rescans.

**`#52` `js/biased-cryptographic-random`:**
```
False positive. server/src/utils/id.ts maps randomBytes() output into a
32-character alphabet (ABCDEFGHJKLMNPQRSTUVWXYZ23456789). Because 256 is
evenly divisible by 32, byte % 32 is uniform here and does not introduce
modulo bias. The current implementation does not have the reported
cryptographic bias issue.
```

**`#46` `MaintainedID`:**
```
Acceptable risk / heuristic-only finding. This repository was created on
2026-03-25 and is still within Scorecard's first-90-days window, so the
alert is driven solely by repository age rather than an outstanding code or
configuration defect. The project is actively maintained, and this check
should age out automatically once the repository is older than 90 days.
```

---

## Blocking Checks

These must pass before any PR merges.

| Check | Workflow | Gate |
|---|---|---|
| Validate (build · test · lint · format · i18n) | `ci.yml` → `validate` | any failure |
| CodeQL (JS/TS, `security-extended`) | `codeql.yml` | any security finding |
| Docker build + healthcheck | `ci.yml` → `docker-validation` | any failure |
| Accessibility smoke | `ci.yml` → `a11y-smoke` | any failure |
| CDK synth (when `cdk/` changed) | `ci.yml` → `cdk-synth` | any failure |

---

## Advisory Checks

Visible in the PR summary and security dashboards. Not yet blocking.

| Check | Workflow | Promotion condition |
|---|---|---|
| Dependency review | `dependency-review.yml` | Enable GitHub Dependency graph, remove `continue-on-error` |
| Trivy filesystem + IaC + secrets | `trivy.yml` → `repo-scan` | Burn down existing `HIGH`/`CRITICAL` baseline, remove `continue-on-error` |
| Trivy container image scan | `trivy.yml` → `image-scan` | Same as above |
| `npm audit --omit=dev --audit-level=high` | `ci.yml` → `validate` | Keep clean enough at high/critical to gate |
| ESLint strict (type-aware `no-unsafe-*`) | `lint-strict.yml` | Get `npm run lint:strict` clean on `main` |
| Knip (unused files/exports/deps) | `knip.yml` | Tune `knip.json` to zero meaningful false positives |
| OSSF Scorecard | `scorecard.yml` | Stays advisory — posture evidence, not a release gate |

---

## Planned Blocker Promotion Order

Advisory checks become blocking after they stay low-noise long enough to
be dependable merge gates. The order:

```
  1.  npm audit --omit=dev --audit-level=high
  2.  npm run lint:strict
  3.  npm run knip
```

Dependency Review and Trivy have their own prerequisites and are governed
separately from the above order.

OSSF Scorecard stays advisory permanently.

---

## Scheduled Sweeps

Scanners run on a weekly cron so newly published advisories surface against
already-merged code without waiting for a PR.

| Workflow | Cadence | Purpose |
|---|---|---|
| `codeql.yml` | Monday 06:00 UTC | Re-scan `main` against latest query pack |
| `trivy.yml` | Monday 07:00 UTC | Re-scan filesystem + image against fresh vulnerability DB |
| `scorecard.yml` | Wednesday 08:00 UTC | Refresh posture score + publish to public Scorecards dataset |
| Dependabot (npm · actions · docker) | Weekly | Grouped patch/minor PRs for all workspaces |

---

## GitHub Secret Scanning

Secret scanning and push protection are enabled at the repo level under
**Settings → Code security and analysis**. These are GitHub-native — not
part of any workflow file in this repo.

- **Secret scanning** — GitHub inspects every push and every PR for known
  credential formats (AWS access keys, GitHub tokens, npm publish tokens,
  Docker Hub PATs, etc.). Matches surface under **Security → Secret scanning
  alerts** and trigger partner revocation where supported.
- **Push protection** — pushes introducing a new supported secret type are
  rejected at the git transport layer. A contributor seeing the block must
  either rotate the credential or bypass with a typed justification.
- **Trivy secret scanner** — belt-and-braces coverage for secret formats
  GitHub doesn't recognize (e.g. custom internal token shapes).

Verify the repo-level toggles:

```bash
gh api -H "Accept: application/vnd.github+json" \
  /repos/:owner/:repo \
  --jq '{secret_scanning: .security_and_analysis.secret_scanning.status,
         push_protection: .security_and_analysis.secret_scanning_push_protection.status}'
```

Expected:
```json
{"secret_scanning": "enabled", "push_protection": "enabled"}
```

If either shows `disabled`, flip it on from the repository settings UI.
These live in repo settings — there is no workflow knob for them.

---

## Dependabot Configuration

`dependabot.yml` configures four ecosystems:

- **npm (root)** — covers `shared/`, `server/`, `client/` via the single
  root `package-lock.json`. Grouped into `production` and `dev`.
- **npm (`cdk/`)** — separate entry because the CDK app has its own lockfile.
  `aws-cdk-lib` + `constructs` + `aws-cdk` grouped together.
- **github-actions** — pins third-party actions to latest version.
- **docker** — bumps the Dockerfile base image.

Several majors are deliberately pinned: `eslint` and friends, `react` /
`react-dom` / i18n (React 19 is its own migration), and
`eslint-plugin-react-hooks`. Minor and patch updates still flow. Each pin
documents its removal condition inline in `dependabot.yml`.

---

## Dependabot Auto-Merge Policy

[`dependabot-automerge.yml`](../.github/workflows/dependabot-automerge.yml)
only **enables GitHub auto-merge** for low-risk Dependabot PRs. It does not
merge directly and does not bypass branch protection — required checks still
decide whether GitHub actually merges.

| PR type | Auto-merge eligible? |
|---|---|
| GitHub Actions update, patch/minor, single dep | ✅ if not in denylist |
| npm devDependency update, patch/minor, single dep | ✅ if not in denylist |
| Dependabot security update, patch/minor, single dep | ✅ if not in denylist |
| Major update | ❌ always manual |
| Docker ecosystem update | ❌ always manual |
| Any PR touching `cdk/` | ❌ always manual |
| Any PR touching deploy workflows | ❌ always manual |
| Grouped / multi-dependency PR | ❌ always manual |

**Excluded dependencies** (always manual regardless of semver range):
React / React DOM · Vite · Vitest · TypeScript · ESLint stack
(`eslint`, `@eslint/*`, `@typescript-eslint/*`, `eslint-plugin-*`) ·
i18next / react-i18next · Fastify core (`fastify`, `@fastify/*`) ·
Socket.IO core (`socket.io`, `socket.io-client`, `@socket.io/*`)

**Excluded paths:** `cdk/**` · `Dockerfile` · deploy workflows

This is intentionally conservative — the repo has recent history of bot PRs
breaking lint, tests, and build. Coverage can expand once the false-positive
and breakage rate stays low.

---

## Triage Workflow

```
  1.  Alert lands
      ├── CodeQL / Trivy / Scorecard  →  Security → Code scanning
      ├── Dependabot / Dep Review     →  Security → Dependabot
      └── Secret scanning             →  Security → Secret scanning

  2.  Assess severity
      high/critical  →  same-week action
      medium/low     →  queue alongside Dependabot PRs

  3.  Suppress false positives at the scanner config level, not by deleting code
      CodeQL  →  query suppression
      Trivy   →  .trivyignore
      Knip    →  knip.json

  4.  Record decisions
      Accepted-risk findings  →  SECURITY_REMEDIATION_PLAN.md
      Architecture decisions  →  plans/decisions/
```

---

## Local Runs

Run these locally to iterate fast:

```bash
npm run lint                              # default lint (blocking in CI)
npm run lint:strict                       # type-aware rules (advisory in CI)
npm run knip                              # unused files/exports/deps
npm test                                  # unit + integration tests
npm audit --omit=dev --audit-level=high   # dependency audit
```

CodeQL, Trivy, and Scorecard are heavier and expected to run in CI only.
Trivy can be run locally with `trivy fs .` and `trivy image yasp:dev` if
you need to reproduce a CI finding.
