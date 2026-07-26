# Security model

Status: Baseline threat model; detailed attacker and metadata model in
`security/threat-model.md`; protocol review required in Stage 0  
Last reviewed: 2026-07-26

## Assets

- Master password and recovery secret.
- Account root, signing, vault, item, attachment, device, and mail private keys.
- Decrypted vault item fields and local search summaries.
- TOTP seeds, backup codes, identity documents, and imports/exports.
- Mail content, alias mappings, contacts, and real mailbox addresses.
- Authentication sessions and infrastructure credentials.

## Trust boundaries

### Trusted while uncompromised

- The user's unlocked client and its crypto worker.
- The browser/OS cryptographic random source.
- Explicitly selected local authenticators and recovery material.
- Reviewed cryptographic library implementations.

### Untrusted for vault confidentiality

- The Worker/Node API.
- D1, SQLite/Postgres, R2, S3, backups, and logging systems.
- DNS, CDN, TLS termination, and hosting operators.
- Network peers and sync transport.
- Other clients until authenticated and authorized.

### Conditionally trusted

- The web origin is trusted to deliver the intended client code, but compromise
  of that origin can steal plaintext. This is a documented model limitation.
- Mail infrastructure is trusted transiently with ordinary SMTP plaintext and is
  not part of the vault's zero-knowledge claim.

## Security invariants

1. Vault plaintext and plaintext vault keys never cross the client trust boundary.
2. The server never receives the master password or a password verifier.
3. Every persisted secret payload is authenticated ciphertext.
4. Cryptographic purpose and format version are bound through associated data or
   explicit domain-separated derivation labels.
5. Unknown critical versions, malformed records, and failed authentication fail
   closed without partial plaintext output.
6. Account recovery never grants the server decryption capability.
7. Item type, URLs, usernames, filenames, notes, TOTP seeds, and tags are encrypted.
8. Server-side merge, search, sorting, telemetry, and logging never require vault
   plaintext.
9. Mail security claims remain separate and narrower than vault claims.
10. Backups preserve recoverability but add no new plaintext custody.

## Threat analysis

| Threat | Planned controls | Residual risk |
| --- | --- | --- |
| Database theft | Argon2id-wrapped ARK, random keys, AEAD, padded sizes | Offline guessing against weak master passwords; metadata |
| Malicious server | AEAD, signed mutation chain, local head memory | Deletion, withholding, rollback to fresh clients, device forks |
| Network MITM | TLS, WebAuthn origin binding, AEAD/signatures | Compromised client, browser, origin, or CA ecosystem |
| Malicious web release | CSP, no third parties, reproducible/signed releases, explicit updates | Delivered JS can capture plaintext; extension/native needed for stronger delivery |
| Compromised unlocked client | OS isolation, short unlock lifetime, least plaintext | Malware/keylogger can read secrets; not fully mitigable |
| Lost locked device | Device lock, no persisted plaintext ARK, session revocation | Browser/OS storage compromise and memory remnants |
| Recovery theft | High-entropy offline secret, optional physical separation | Recovery secret is full alternative decryption authority |
| Import attack | Offline isolated parser, limits, schemas, fuzzing | Parser/runtime vulnerabilities and resource exhaustion |
| Export theft | Independent passphrase/KDF, authenticated streaming format | Weak export passphrase or plaintext destination compromise |
| Dependency compromise | Pinning, review, SBOM, provenance, minimal dependencies | Maintainer/registry/CI compromise remains possible |
| Traffic analysis | Padding, minimal logs, opaque IDs | Timing, IP, counts, sizes, update frequency remain visible |
| Coercion | Honest UX and no false claims | Neutron does not provide plausible deniability |
| Provider loss | External encrypted backups, self-host adapters, restore drills | Recent writes since last backup may be lost |

## Metadata inventory

The vault server may know:

- An opaque account identifier and credential identifiers.
- When an account authenticates and syncs.
- Source IP and coarse client/network information exposed by infrastructure.
- Number of opaque objects and blobs.
- Padded ciphertext sizes and access frequency.
- Stable object identifiers and which revisions replace/delete them.
- Authentication failures, rate-limit events, and session lifetimes.

The server must not know:

- Item type, title, URL, username, password, notes, tags, or folder names.
- TOTP seeds/codes, backup codes, card/bank fields, or document filenames.
- Decrypted search terms or result content.
- Import source formats or plaintext export contents.

Mail necessarily reveals more to its mail subsystem:

- Recipient alias/domain, sender envelope address, timestamps, message size.
- Alias routing relationship while a message is processed.
- Ordinary SMTP content before encryption at rest.
- Bounce, reputation, spam, and delivery signals.

## Key lifecycle questions every implementation must answer

- How is the key generated and with which CSPRNG?
- Where is it held while unlocked, and when is it released?
- Which exact key may wrap or encrypt it?
- What versioned AAD and derivation label binds its purpose?
- How is compromise rotated without unnecessary re-encryption?
- Which backup/recovery paths preserve it?
- What metadata does its use reveal?
- What test vector proves cross-runtime behavior?

## Security release gates

- No stable crypto format without independent review and fixed test vectors.
- No real credentials before Stage 5 adversarial review and restore drill.
- No mail security claim without inspecting the actual raw SMTP pipeline.
- No public registration without a new abuse, privacy, and authorization review.
- No sharing feature without a new public-key distribution and transparency model.
