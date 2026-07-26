# Neutron master plan

Status: Accepted direction, pre-implementation  
Last reviewed: 2026-07-26

## 1. Executive summary

Neutron will be built as two deliberately separate products:

1. A zero-knowledge secrets vault whose server stores and transports ciphertext.
2. A later alias and mail subsystem that minimizes metadata and encrypts stored
   mail but acknowledges that normal SMTP is plaintext at provider boundaries.

The first deployment will use a static React/Vite PWA, a small TypeScript
Cloudflare Worker API, D1 for opaque records, and R2 for encrypted blobs. The
domain and protocol layers will depend on portable interfaces so the published
project can also run on Node with SQLite/Postgres and S3-compatible storage.

The plan prioritizes a small, reviewable vault over a broad Proton clone. Mail,
native mobile applications, browser extensions, and CLI support follow only
after the vault's security claims have been tested.

## 2. Product principles

- Do not trust the server with vault plaintext or decryption authority.
- Make trust boundaries visible in architecture, types, tests, and UX.
- Prefer established primitives and libraries to novel cryptography.
- Encrypt all vault fields, not only obvious secret values.
- Minimize metadata, then document metadata that cannot be hidden.
- Keep export and recovery usable so hosting is not custody.
- Prefer boring, portable components over provider-specific cleverness.
- Keep the solo-developer scope honest.
- Treat open-source supply-chain security as part of the product.
- Do not make claims that ordinary SMTP cannot satisfy.

## 3. Accepted defaults

| Decision | Accepted direction |
| --- | --- |
| Vault application | Static React + Vite PWA |
| Content/docs site | Astro only if a separate public site is needed |
| Backend | TypeScript Fetch API/Hono-compatible service |
| Hosted data | D1 for records; R2 for encrypted blobs |
| Self-host mode | Node adapter with SQLite first and Postgres later |
| Client crypto | TypeScript API over libsodium WASM, provider abstraction |
| Account authentication | WebAuthn/passkeys |
| Vault unlock | Local master password with Argon2id |
| Recovery | Offline random recovery kit can unwrap the account root key |
| Mobile | PWA first, React Native/Expo later |
| Alias path | Cloudflare spike, then Cloudflare or upstream SimpleLogin |
| Mail | Separate subsystem after vault hardening |
| Licensing | AGPL applications/server; permissive crypto/protocol packages |
| Browser baseline | Current Chromium, Firefox, and Safari |

## 4. Product scope

### Vault MVP

- Logins, secure notes, TOTP seeds/codes, backup codes, arbitrary JSON.
- Schema-based cards, accounts, addresses, identities, and documents.
- Password/passphrase generator.
- Encrypted local cache and encrypted sync.
- Offline import, versioned encrypted export, and offline recovery kit.
- Client-side search and sorting using bounded decrypted index shards.
- Multi-device conflict handling without server-side plaintext merges.

### Later vault surfaces

- Signed browser extensions with autofill and alias generation.
- CLI reusing crypto, protocol, and sync packages.
- React Native/Expo application and native autofill integrations.
- Optional WebAuthn PRF-based convenience unlock after compatibility testing.

### Mail and aliases

- Bring-your-own-domain verification.
- Random and custom aliases, disable/delete semantics, and reverse aliases.
- Forwarding first; stored encrypted mailbox later.
- SPF, DKIM, DMARC, bounce, abuse, spam, and deliverability handling.
- Encryption of raw MIME immediately after required server-side processing.

### Explicit non-goals

- Public registration, sharing, teams, and family plans.
- Calendar, drive, VPN, billing, enterprise administration, or public SaaS.
- Searchable encryption or server-visible URL hashes.
- Plausible deniability claims.
- Building an SMTP stack from scratch before an alias spike proves the need.

## 5. Authentication and key hierarchy

Account authentication and vault unlocking are separate:

- WebAuthn proves account authorization to the server using a private key held by
  an authenticator. The server stores only public credential material.
- The master password is processed locally and only unwraps the random account
  root key. It is not a server login password.

OPAQUE is the preferred future aPAKE if password-only remote authentication is
ever required. SRP will not be implemented for the initial design.

```text
master password
  -> Argon2id password key
  -> unwraps account root key (ARK, random 256 bits)

recovery secret
  -> domain-separated recovery wrapping key
  -> independently unwraps the same ARK

ARK
  -> wraps the account mutation-signing key (Task 0004)
  -> wraps each random vault key

vault key
  -> wraps each random item key

item key
  -> encrypts complete item payload and attachment-key metadata
```

Initial KDF profile:

- Argon2id v1.3 with 64 MiB memory, 3 iterations, and parallelism 1. This
  aligns the Stage 1 provider with libsodium's maintained `crypto_pwhash` API;
  a provider change or a different lane count requires a reviewed successor
  envelope profile and vectors.
- Parameters and salt stored in the versioned wrapper envelope.
- Enrollment benchmark targeting roughly 500–1,000 ms on the slowest supported
  device, without silently falling below the security floor.
- Password changes re-wrap the ARK rather than re-encrypting item content.

Initial AEAD profile:

- XChaCha20-Poly1305 with random 256-bit keys and random 192-bit nonces.
- HKDF-SHA-256 for explicitly labelled derived subkeys.
- Associated data binds format version, object ID, key version, and purpose.
- Canonical, length-delimited binary envelopes with strict limits.
- Ciphertext size-class padding where practical.

The precise envelope specification and test vectors are Stage 0 deliverables and
must receive independent review before implementation is treated as stable.

## 6. Recovery semantics

The emergency kit contains a high-entropy recovery secret, account identifier,
format version, and checksum. The planned protocol uses domain-separated
recovery material to:

- Authenticate recovery through an asymmetric challenge-response without
  revealing the recovery secret.
- Unwrap a recovery copy of the ARK entirely on the client.

Consequences are stated plainly:

- Password lost, recovery kit retained: data is recoverable.
- Password lost, unlocked authorized device retained: password can be replaced.
- Password, recovery kit, and all unlocked devices lost: data is irrecoverable.

Recovery is therefore an alternative decryption authority. The server is never
an escrow agent and cannot reset encryption on its own.

The Stage 0 authentication/recovery specification must select and bind the exact
signature construction, deterministic key derivation or stored key material,
challenge transcript, account/public-key binding, TTL, replay protection,
rotation, revocation, rate limits, and test vectors. Until that specification and
review are complete, recovery challenge signing is a design goal rather than a
finished protocol.

## 7. Sync model

The server is an opaque operation and blob store. Clients create signed,
append-only mutations that commit to the prior account head and ciphertext hash.

Required properties:

- Optimistic concurrency using an expected signed head.
- Idempotency keys for retries.
- Client-generated conflict copies for concurrent item edits.
- Deletion tombstones with documented retention.
- A locally remembered signed head to detect rollback.
- Cross-device comparison of heads when possible.

AEAD and signatures prevent undetected content forgery. A malicious server can
still delete data, withhold updates, replay history to a fresh client, or fork
devices that never compare heads. A future transparency service may reduce the
fork risk, but it is not required for the MVP.

## 8. Search, TOTP, import, and export

Search uses encrypted index shards. The trusted client decrypts only bounded
summary batches in a dedicated worker and decrypts complete items on demand.
Deterministic searchable encryption is excluded because it leaks equality and
query patterns.

TOTP seeds remain encrypted at rest and in transit. The client worker decrypts a
seed only to calculate RFC 6238 output and treats memory cleanup as best effort.

Imports are untrusted input and run offline in an isolated worker with strict
file, record, string, nesting, and schema limits. Importers never execute formulas
or HTML and never upload the source file.

The `.neutron` export is a streaming, versioned container with an independent
Argon2id export key, authenticated manifest, per-entry AEAD, and encrypted
attachments. A single-bit change must fail closed.

## 9. Web-client trust

A malicious deployment can serve JavaScript that captures the master password
or plaintext after decryption. CSP, Trusted Types, dependency pinning, a PWA
service worker, and reproducible builds reduce attack surface but cannot remove
this fundamental web-delivery risk.

Mitigations are cumulative:

- Static application with no third-party runtime content.
- Strict CSP, Trusted Types, HSTS, frame denial, and isolated crypto worker.
- Explicit update UX and published release/build hashes.
- Minimal dependency set, lockfiles, SBOM, provenance, and signed releases.
- Eventually, signed browser-extension and native distributions.
- No primary credentials before the external Stage 5 review gate.

## 10. Mail reality and direction

SMTP providers and receiving processes see ordinary messages before Neutron can
encrypt them at rest. Outbound relays also receive message plaintext. Neutron may
claim encrypted storage and minimized retention, but not vault-like zero
knowledge unless the correspondent used end-to-end encryption before SMTP.

Alias-to-mailbox unlinkability is also bounded: a live router must resolve an
alias to a destination. Separate mail and vault databases, random mailbox IDs,
keyed alias lookup, and short log retention reduce static leakage but do not hide
the relationship from the running router.

The planned decision sequence is:

1. Spike Cloudflare Email Routing and Email Sending on a non-critical domain.
2. Verify reverse alias, header, bounce, loop, PGP/MIME, and attachment behavior.
3. Continue only if current limits suit the intended personal usage.
4. Otherwise deploy a pinned upstream SimpleLogin release as a separate service.
5. Do not fork SimpleLogin without a concrete capability gap and maintenance plan.
6. Build a stored encrypted mailbox only after aliases and vault hardening.

## 11. Open-source and supply-chain security

- Never commit production secrets or identifiers.
- Deploy using short-lived CI identity rather than long-lived shared tokens.
- Pin CI actions, minimize workflow permissions, and isolate untrusted PR jobs.
- Produce SBOMs, provenance, signed tags/releases, and reproducible build steps.
- Run secret, dependency, license, static-analysis, and artifact-integrity checks.
- Publish `SECURITY.md`, disclosure instructions, and supported-version policy.
- Treat public contributions and dependency updates as untrusted code changes.
- Keep operational configuration separate from published examples.

## 12. Operations and cost target

The personal vault should fit Cloudflare's free allowances, leaving the domain as
the primary cost. Workers Paid currently starts at USD 5/month and is expected
for arbitrary outbound Cloudflare email. R2 mail volume and a second-provider
encrypted backup add variable cost.

Expected planning ranges:

| Deployment | Expected monthly infrastructure |
| --- | ---: |
| Vault MVP | USD 0 plus domain |
| Vault on Workers Paid | About USD 5 plus domain |
| Cloudflare alias experiment | About USD 5 plus domain |
| SimpleLogin, VPS, and relay | About USD 5–25 plus domain |

Backups must include ciphertext and required account/authentication metadata and
must exist outside the primary Cloudflare account. Restore drills are release
criteria, not optional operations work.

## 13. Risk register

| Risk | Likelihood/impact | Mitigation and gate |
| --- | --- | --- |
| Malicious web release steals plaintext | Medium/critical | No third parties, reproducible signed releases, Stage 5 review, later signed extension/native clients |
| Browser/WASM compatibility weakens KDF UX | Medium/high | Stage 0 browser matrix and benchmarks; persisted parameters; no silent downgrade |
| Recovery material is lost or stolen | Medium/critical | Two passkeys, confirmation drill, custody guidance, rotation/revocation protocol |
| Cloudflare account/provider concentration | Medium/high | Portable ports, external encrypted backup, restore drill outside the account |
| Provider limits or pricing change | Medium/medium | Recheck primary docs at each gate; self-host adapters; bounded budgets |
| Mail delivery or attachment limits make mail unusable | High/high | Stage 6 non-critical-domain spike; managed delivery; SimpleLogin fallback |
| Crypto/WASM or auth dependency becomes unmaintained | Medium/high | Small provider interfaces, pinned versions, provenance, replacement vectors |
| Solo-maintainer error or unavailable reviewer | High/high | Small stages, durable tasks/ADRs, separate review, delayed real credentials |
| Server rollback/fork remains partly undetectable | Medium/high | Signed chains, remembered heads, device comparison, honest limitation |
| Contribution or CI supply-chain compromise | Medium/critical | Minimal permissions, isolated PR jobs, pinned actions, SBOM/provenance/signing |

Remaining owner decisions are deferred to their implementation gates:

- Confirm copyright-holder identity before adding licenses.
- Select minimum browser/OS versions after the Stage 0 compatibility study.
- Choose Cloudflare or upstream SimpleLogin from Stage 6 evidence.
- Decide whether Stage 7 needs IMAP or only Neutron clients.
- Choose the external backup target before Stage 3 production deployment.

## 14. Research references

- [OPAQUE, RFC 9807](https://datatracker.ietf.org/doc/html/rfc9807)
- [Argon2, RFC 9106](https://www.rfc-editor.org/info/rfc9106/)
- [WebAuthn Level 3](https://www.w3.org/TR/webauthn-3/)
- [Libsodium XChaCha20-Poly1305](https://doc.libsodium.org/secret-key_cryptography/aead/chacha20-poly1305/xchacha20-poly1305_construction)
- [Proton Pass security model](https://proton.me/blog/proton-pass-security-model)
- [Bitwarden security whitepaper](https://bitwarden.com/help/bitwarden-security-white-paper/)
- [SimpleLogin repository and self-hosting](https://github.com/simple-login/app)
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Cloudflare Email Service pricing](https://developers.cloudflare.com/email-service/platform/pricing/)
- [Cloudflare Email Service limits](https://developers.cloudflare.com/email-service/platform/limits/)

Pricing, limits, library maturity, and browser support must be rechecked at the
stage where they become implementation dependencies.
