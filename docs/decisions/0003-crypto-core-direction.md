# ADR 0003 — Crypto core direction

- Status: Accepted
- Date: 2026-07-26

## Decision

Begin with a narrow TypeScript crypto API backed by a maintained libsodium WASM
provider. Use XChaCha20-Poly1305, Argon2id, reviewed CSPRNGs, and explicitly
specified key derivation. Keep provider and envelope interfaces independent so a
Rust/native provider can be added after the protocol stabilizes.

## Consequences

This optimizes initial auditability for a TypeScript-oriented project while
avoiding premature WASM/FFI ownership. JavaScript memory erasure remains best
effort and must be documented. Every format requires fixed cross-runtime vectors.

