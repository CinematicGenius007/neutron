# Staged execution roadmap

Stages are security gates, not calendar promises. A later stage starts only when
the previous stage's acceptance criteria are satisfied or an ADR explicitly
records why work may safely overlap.

## Stage 0 — Foundation and specifications

Goals:

- Initialize Git and the TypeScript monorepo without implementing product logic.
- Complete threat, metadata, envelope, recovery, sync, and browser-delivery specs.
- Establish test-vector and adversarial-test formats.
- Establish open-source governance and supply-chain policy.
- Validate Cloudflare development and self-host adapter assumptions.

Acceptance criteria:

- Every server field is classified as public metadata, ciphertext, or operational
  secret.
- Enrollment, unlock, password change, recovery, device loss, rollback, deletion,
  and key rotation can be traced on paper.
- Crypto envelopes have a version, canonical encoding, limits, derivation labels,
  test-vector schema, and migration rule.
- Authentication and recovery have abuse/rate-limit requirements.
- CI never exposes deploy secrets to untrusted changes.
- Stage 1 tasks can be implemented without inventing missing protocol behavior.

Initial tasks live in `docs/coordination/tasks/0001-*` through `0009-*`.

## Stage 1 — Crypto and protocol kernel

Deliverables:

- `packages/crypto` API and libsodium WASM provider.
- Canonical envelope encoders/decoders.
- Argon2id key wrapping, XChaCha20-Poly1305 AEAD, HKDF labels, and CSPRNG use.
- Cross-runtime known-answer, mutation, truncation, wrong-AAD, and version tests.
- Synthetic security fixtures only.

Acceptance criteria:

- Browser and Node produce/consume the same fixed vectors.
- All malformed, forged, truncated, oversized, and unknown-critical inputs fail
  closed without partial plaintext.
- KDF parameters are persisted and enforce a minimum policy.
- Dependency versions, provenance, and licenses are recorded.
- A separate reviewer completes the crypto review task.

## Stage 2 — Offline single-device vault

Deliverables:

- Static installable React PWA.
- Local enrollment, unlock, lock, and encrypted IndexedDB.
- Offline emergency-kit generation, confirmation, and recovery wrapper creation.
- Login, secure note, TOTP, backup-code, and JSON items.
- Schema-driven forms for additional item types.
- Password/passphrase generator and bounded local search.
- No server dependency.

Acceptance criteria:

- Browser persistence contains no recognizable fixture plaintext.
- Local initialization cannot complete until recovery material is confirmed.
- Offline reload works and locked reload reveals nothing.
- Full item payload, type, URL, tags, and filename are encrypted.
- RFC TOTP vectors pass and seeds never enter logs/network.
- Corrupt records fail individually without damaging the remaining vault.
- Memory-lifetime limitations are documented honestly.

## Stage 3 — Passkeys and encrypted sync

Deliverables:

- WebAuthn enrollment/login and backup credential management.
- Worker API and D1/R2 adapters.
- Signed append-only mutations, heads, cursors, and tombstones.
- Encrypted multi-device sync and explicit client-side conflict copies.
- Portable storage interfaces and a minimal local adapter test suite.

Acceptance criteria:

- Captured HTTP traffic and a full database dump contain no fixture plaintext,
  master password, or password verifier.
- Two clients converge after offline and concurrent edits.
- Forged, replayed, stale-head, duplicate, and oversized commits are rejected.
- Credential removal requires another authorized credential or recovery.
- Backup/restore covers authentication metadata and ciphertext.

## Stage 4 — Recovery, import, and export

Deliverables:

- Fresh-device recovery, recovery rotation/revocation, and recovery drills using
  the emergency kit created during local initialization.
- Password-change and wrapper/key rotation flows.
- Offline sandboxed importers for selected Bitwarden, 1Password, and Proton formats.
- Streaming versioned `.neutron` encrypted exports.
- Parser fuzzing and malicious fixture corpus.

Acceptance criteria:

- A clean browser profile recovers using only the documented emergency kit.
- Password change does not re-encrypt all items.
- One-bit export corruption fails authentication.
- Import limits stop oversized, deeply nested, prototype-polluting, and formula
  injection inputs.
- Source import files are never transmitted.
- Export/restore works across supported browser and Node implementations.

## Stage 5 — Delivery hardening and dogfood gate

Deliverables:

- Strict CSP, Trusted Types, HSTS, frame protection, and compatible isolation.
- No third-party runtime assets or telemetry.
- Explicit PWA update policy and build identifier UX.
- Reproducible release instructions, SBOM, provenance, and signed artifacts.
- External or genuinely independent adversarial review.
- Backup, restore, provider-loss, lost-device, and recovery drills.

Acceptance criteria:

- Security-header and dependency policies are automated.
- Release artifacts match published source/build instructions.
- High-severity review findings are resolved or explicitly block release.
- Restore succeeds without access to the primary hosting account.
- Only after this gate may low-risk real credentials be introduced gradually.

## Stage 6 — Alias service experiment

Deliverables:

- Dedicated non-critical mail domain.
- Cloudflare inbound/outbound proof of concept.
- Random/custom aliases, disable/delete, reverse aliases, loops, bounces, and logs.
- SPF, DKIM, DMARC, PGP/MIME, attachment, spam, and abuse test report.
- Cloudflare versus pinned upstream SimpleLogin decision ADR.

Acceptance criteria:

- Original mailbox is not exposed in normal forwarded/reverse-alias headers.
- Alias deletion and disabling behavior is verified against queued/in-flight mail.
- Provider and database metadata exposure is documented from captured raw mail.
- Deliverability and attachment limits are measured, not assumed.
- The ongoing option fits the stated monthly budget and maintenance tolerance.

## Stage 7 — Encrypted stored mailbox

Deliverables:

- Domain/address administration and mailbox UI.
- Immediate public-key encryption of accepted raw MIME.
- Encrypted object storage, client decryption, attachment handling, and retention.
- Outbound authenticated submission and managed delivery strategy.
- Spam, abuse, bounce, reputation, and operational runbooks.

Acceptance criteria:

- Stored mail blobs and backups are ciphertext.
- The precise plaintext processing window and parties are documented.
- SPF, DKIM, DMARC, forward/reverse DNS where applicable, bounce, complaint, and
  suppression behavior pass test-domain checks.
- The product never represents ordinary SMTP as zero-knowledge.
- Mail compromise does not grant vault key access.

## Stage 8 — Extension, CLI, and mobile

Order:

1. Signed browser extension with autofill and alias generation.
2. CLI using shared crypto/protocol/sync packages.
3. React Native/Expo application.
4. Native Android/iOS autofill and secure-key integrations.

Acceptance criteria:

- All clients consume common protocol vectors.
- Signed releases and update channels are documented.
- Platform secure storage caches only revocable/wrapped keys under an explicit UX
  policy.
- A compromised extension/native client is included in the revised threat model.

## Optional differentiators after core completion

- Local-only vault health, password reuse, and weak-password reports.
- Breach checks using k-anonymity without exposing complete hashes.
- Alias-per-service conventions and automatic naming.
- Emergency kit PDF with checksum and recovery drill reminders.
- Device-to-device approval using ephemeral public keys.

Do not build teams, sharing, dead-man access, hidden vaults, AI features, or public
registration until their security models and long-term maintenance costs justify
the scope.
