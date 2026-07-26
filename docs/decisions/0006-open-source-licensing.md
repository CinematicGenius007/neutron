# ADR 0006 — Open-source licensing direction

- Status: Accepted
- Date: 2026-07-26

## Decision

Plan to license deployed applications and server code under AGPL-3.0-or-later.
Plan to license reusable crypto and protocol packages under Apache-2.0 or MPL-2.0
after a compatibility review. No license headers are added until the repository
owner identity and package boundaries are finalized.

## Consequences

Network deployments of modified applications remain subject to copyleft, while
core packages can receive wider scrutiny and reuse. Integration with SimpleLogin
should remain process/API-level unless derivative licensing is intentionally
accepted.

