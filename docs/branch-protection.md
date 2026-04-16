# Branch protection and merge workflow

This doc is the maintainer-facing source of truth for **how `main` is
protected** and **how PRs are expected to merge**. Everything here lives in
GitHub repository settings rather than in a workflow file, so it has to be
applied by hand once and re-checked when the required-checks list changes.

The repo-side automation (CI workflows, Dependabot auto-merge) is documented
in [`docs/security-scanning.md`](./security-scanning.md). This doc only covers
the UI-side configuration.

## TL;DR

- One ruleset on `refs/heads/main`. Keep it strict.
- PR review required. Stale approvals dismissed. Force-push and deletion
  blocked.
- Required status checks must include the blocking CI lanes listed below.
- Merge queue is **optional**. Turn it on if `main` starts breaking from
  serial-merge races; otherwise the existing concurrency groups are enough.
- Apply the ruleset to administrators too.

## Recommended branch ruleset

Settings → Rules → Rulesets → New branch ruleset.

- **Target:** `refs/heads/main`.
- **Enforcement status:** `Active`.
- **Bypass list:** empty unless there is a documented break-glass need.

Rules to enable:

- **Restrict deletions** — prevent accidental deletion of `main`.
- **Block force pushes** — keep history append-only.
- **Require linear history** — squash-merge style is already used; this just
  enforces it at the ref level.
- **Require a pull request before merging**
  - Required approvals: at least `1`.
  - Dismiss stale pull request approvals when new commits are pushed.
  - Require approval of the most recent reviewable push.
  - Require conversation resolution before merging.
- **Require status checks to pass**
  - Require branches to be up to date before merging.
  - Add every blocking check from the list below.
- **Require signed commits** — optional. Turn on if all maintainers can sign;
  do not turn on if it would block Dependabot or GitHub-managed bots.
- **Apply to administrators** — yes, unless there is a documented bypass
  policy. The point of the ruleset is that nobody pushes raw to `main`.

## Required status checks (blocking lanes)

These are the CI checks that must succeed before GitHub will allow merge.
They match the blocking lanes documented in
[`docs/security-scanning.md`](./security-scanning.md#merge-blockers-today).

Add each of these by exact check name in the ruleset's required-checks list:

- `validate` (CI)
- `a11y-smoke` (CI)
- `docker-validation` (CI)
- `cdk-synth` (CI) — only fires real work when `cdk/` changes, but the
  required-check entry should still be present so the wiring stays honest.
- `CodeQL analyze (javascript-typescript)` (CodeQL)

Optional but recommended once it has stayed stable:

- `Dependency review` — promote to required after enabling **Dependency
  graph** under Settings → Code security and analysis. Until then leave it
  advisory; making it required would red every PR with the existing
  "dependency review is not supported on this repository" failure.

Do **not** add the advisory lanes (`knip`, `lint-strict`, `Trivy`,
`Scorecard`, the `npm-audit` step inside `validate`) as required checks.
They are intentionally non-blocking and are tracked for promotion in the
[Planned promotion order](./security-scanning.md#planned-promotion-order-for-advisory-lanes).

When the required-checks list above changes (a check is renamed, added, or
retired), update both this doc **and** the ruleset entries in the same PR
review pass.

## Merge queue (optional)

GitHub merge queue serializes PR merges so that each one is rebased on the
result of the previous queued PR before its required checks run again. This
prevents the "two PRs were green individually, but their combination breaks
`main`" failure mode.

YASP does **not** require merge queue today. The repo is small, merges are
infrequent, and the existing per-workflow `concurrency` groups already cancel
in-flight CI for superseded branches. Turn merge queue on only if these
signals appear:

- `main` repeatedly red for reasons that look like serial-merge races rather
  than honest test failures.
- Multiple maintainers landing PRs the same hour.
- Dependabot auto-merge volume reaches a level where the auto-merge action
  often races human merges.

If you do enable it:

- Settings → Rules → Edit ruleset for `main` → enable
  **Require merge queue**.
- Set merge method to **Squash and merge** to match current history style.
- Pick a small queue group size (`1`–`3`) initially; raise only after
  watching how often the rebased re-runs flap.
- Re-list the same required status checks above under the merge queue
  entry — GitHub treats them as separate selectors.

If you turn merge queue off later, remember to re-check that all required
status checks remain selected on the underlying ruleset (the queue UI can
silently drop selections).

## Direct pushes

Direct pushes to `main` should not happen. The current backlog of CodeQL
governance alerts (`BranchProtectionID`, `CodeReviewID`) exists because the
ruleset above is not yet enforced. Closing them only requires:

1. Apply the ruleset described in this doc.
2. Stop pushing to `main` — go through PRs.
3. Re-run the relevant CodeQL sweep so the alert clears.

The exact dismissal text for the remaining heuristic-only alerts is recorded
in [`docs/security-scanning.md`](./security-scanning.md#recorded-dismissal-rationale-text).

## Verifying the configuration

```
gh api -H "Accept: application/vnd.github+json" \
  /repos/:owner/:repo/rulesets \
  --jq '.[] | {name, target, enforcement}'
```

Expected: at least one ruleset targeting `branch` with `target.ref ==
refs/heads/main` and `enforcement == active`.

```
gh api -H "Accept: application/vnd.github+json" \
  /repos/:owner/:repo/branches/main/protection \
  --jq '{required_checks:.required_status_checks.contexts,
         required_reviews:.required_pull_request_reviews,
         enforce_admins:.enforce_admins.enabled}'
```

Expected: `required_checks` lists the blocking checks above,
`required_reviews.required_approving_review_count` is at least `1`, and
`enforce_admins` is `true`.

If you change the required-checks list, run those queries afterwards to
confirm the change actually landed in GitHub's view of the repo.
