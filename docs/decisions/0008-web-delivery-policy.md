# ADR 0008 — Web delivery policy

- Status: Accepted
- Date: 2026-07-28

## Context

The vault is a static, offline-capable React application. Its origin can replace
the JavaScript that sees an unlocked vault, so delivery policy is part of the
trusted computing base even though persisted records are encrypted. The project
must remain inexpensive to host, portable away from Cloudflare, and reproducible
from public source.

## Decision

Ship the vault as a static Vite build with no Pages Functions, server rendering,
third-party runtime resources, analytics, tag managers, or remote telemetry.
Production hosts must apply the normative policy in
[`docs/security/web-delivery.md`](../security/web-delivery.md) to every document
and executable response.

Use a dedicated vault worker for session keys, envelope operations, and encrypted
storage orchestration. The window may handle item plaintext needed for rendering,
but receives no raw key material. The service worker is a separate, non-crypto
component that caches only an exact allowlist of versioned static assets.

Service-worker updates wait for explicit user activation. If a vault is unlocked,
activation first locks it and waits for acknowledgement, then activates and
reloads. Builds expose a deterministic build identity derived from source and
artifact hashes, never a build timestamp or secret.

Cloudflare Pages is the initial low-cost host. A checked-in `_headers` file is
the deployable reference, while automated tests apply the same assertions to any
self-host adapter.

## Consequences

- Stage 2 can operate without a server, cookies, or cross-origin requests.
- A strict CSP and Trusted Types reduce injection paths but do not protect against
  a malicious origin, compromised dependency, browser extension, or already
  authorized plaintext request.
- Cross-origin isolation forbids unapproved embedded resources and pop-up-based
  integrations. Any future widening requires an ADR and adversarial tests.
- Updates cannot silently replace code in an unlocked session; users may briefly
  remain on the prior cached build until they lock and reload.
- Cloudflare rollback is an operational convenience, not a client rollback
  protocol. A rollback is published as another reviewed build identity.
