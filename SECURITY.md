# Security Policy

## Supported Versions

YASP is intentionally lightweight and ships from the `main` branch. Security
fixes are applied to the current code only.

| Version | Supported |
| --- | --- |
| `main` / current deployment | Yes |
| Older commits, forks, and archived snapshots | No |

## Reporting a Vulnerability

Please report security issues privately through GitHub Security Advisories:

- [Report a vulnerability](https://github.com/wleonhardt/YASP/security/advisories/new)

If private reporting is temporarily unavailable, open a regular GitHub issue
only for non-sensitive hardening discussions. Do not post exploit details,
credential material, or reproduction steps for live vulnerabilities in public.

## Response Expectations

- Acknowledge new reports as quickly as practical.
- Triage severity and impact before discussing remediation publicly.
- Land the smallest safe fix that preserves YASP's current ephemeral/no-account
  product boundaries.
- Credit reporters in release notes or follow-up documentation when they want
  public attribution.

## Repository Governance Follow-up

Some remaining GitHub code scanning alerts after the 2026-04-16 remediation
pass are governance-level rather than runtime-code defects. Branch protection,
required reviews, and similar maintainer settings are tracked in
[`docs/security-scanning.md`](./docs/security-scanning.md) alongside the
recorded dismissal rationale for the remaining false-positive or
heuristic-only alerts.
