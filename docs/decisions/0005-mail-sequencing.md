# ADR 0005 — Mail sequencing

- Status: Accepted
- Date: 2026-07-26

## Decision

Complete the hardened vault before production mail. Spike Cloudflare Email
Service for aliases on a non-critical domain, then choose between that path and
a pinned upstream SimpleLogin deployment. Do not fork SimpleLogin initially.

Build a stored mailbox only after alias, deliverability, abuse, raw-header, and
attachment tests are complete.

## Consequences

Mail remains a separate trust domain and may see ordinary SMTP plaintext before
at-rest encryption. Current provider prices, limits, and beta status must be
rechecked at the Stage 6 gate.

