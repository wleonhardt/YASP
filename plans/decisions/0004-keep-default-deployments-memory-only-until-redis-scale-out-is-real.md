# ADR 0004: Keep Default Deployments Memory-Only Until Redis Scale-Out Is Real

- Status: accepted
- Date: 2026-04-15
- Relates to: ADR 0001, ADR 0002, ADR 0003

## Context

ADR 0003 made `YASP_STATE_BACKEND=redis` operational for a single app instance
while keeping Redis strictly ephemeral and TTL-bound. That gave YASP an opt-in
active-state backend, but it did **not** make the product honestly
multi-instance ready.

At the same time, the AWS/CDK path already provides a supportable deployment
shape for the actual default runtime:

- one app instance
- in-memory room state
- no Redis dependency
- no claim of horizontal scale

We need a documented repo-level stance for two related questions:

1. Should the AWS/CDK path start wiring Redis infrastructure now?
2. Should true multi-instance Redis support be treated as a near-term product
   priority?

Without an explicit decision, the docs and future work queue can drift into
implying a scaling maturity YASP does not yet have.

## Decision

Keep the default deployment posture intentionally simple and memory-first.

- The supported/default AWS/CDK deployment path remains memory-only.
- The CDK stack does **not** gain first-class Redis wiring yet.
- That is by design, not an omission.
- If Redis deployment support is added later, it must be a separate advanced
  deployment profile, not the default path.

Treat true multi-instance Redis support as long-term infrastructure work, not a
near-term core product priority.

- It remains a valid future goal.
- It does not outrank product simplicity, UX, accessibility, or runtime
  stability right now.
- It should only move up when operator requirements justify it, such as:
  - rolling deploys without dropping active rooms
  - meaningful concurrent traffic beyond one app instance
  - hosting environments that require multiple app instances
  - higher availability requirements than the current single-instance posture

## Consequences

- Self-hosters and operators get a simpler, lower-cost AWS story by default.
- YASP avoids implying that Redis mode is already a safe multi-instance
  deployment profile.
- Redis remains documented as ephemeral active-room/session state only, not a
  history or persistence feature.
- Future Phase 4 work stays explicitly conditional on operator demand instead of
  becoming accidental roadmap priority.
- If/when advanced Redis deployment support is added, it will land behind a
  clearly separate operator path rather than quietly changing the default
  deployment model.
