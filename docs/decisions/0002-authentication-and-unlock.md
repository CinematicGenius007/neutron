# ADR 0002 — Separate authentication from vault unlock

- Status: Accepted
- Date: 2026-07-26

## Decision

Use WebAuthn/passkeys for server account authentication. Use the master password
only in the client to derive a key that unwraps the account root key. Provide an
offline high-entropy recovery kit as an independent local unwrap authority.

OPAQUE is the future choice if password-only server authentication is required.
Do not implement SRP for the initial product. WebAuthn PRF may later offer a
convenience unlock but is not the sole recovery/unlock path initially.

## Consequences

The server receives neither the master password nor a password verifier. Users
must maintain two passkeys and an emergency kit. Recovery means password loss is
not fatal if another authorized device or the recovery kit survives.

