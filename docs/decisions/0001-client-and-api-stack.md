# ADR 0001 — Client and API stack

- Status: Accepted
- Date: 2026-07-26

## Context

The vault is an offline-capable, client-heavy application. The team is most
productive in TypeScript and wants low cost without coupling the open-source
project to one provider.

## Decision

Use a static React/Vite PWA for the vault and a thin TypeScript Fetch API,
optionally organized with Hono. Use Astro only for a later content/documentation
site. Do not require Next.js SSR or React Server Components for the vault.

## Rationale and consequences

This keeps secrets on an explicit client boundary, reduces deployment/runtime
surface, and remains portable to Workers and Node. It gives up Next.js conventions
that do not materially benefit an unlocked offline vault.

