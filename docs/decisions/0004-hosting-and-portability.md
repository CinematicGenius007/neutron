# ADR 0004 — Cloudflare-first hosting with portable adapters

- Status: Accepted
- Date: 2026-07-26

## Decision

Use Workers, D1, and R2 for the first hosted deployment. Define storage, blob,
session, and rate-limit ports so the open-source distribution can run on Node
with SQLite/Postgres and filesystem/S3-compatible storage.

## Consequences

The personal vault should fit low or free usage tiers, while the protocol remains
self-hostable. Cloudflare-specific bindings are confined to `infra/cloudflare`
and application adapters. Backups must exist outside the Cloudflare account.

