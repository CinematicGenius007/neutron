# ADR 0010 — Versioned binary crypto envelope format

- Status: Proposed
- Date: 2026-07-26
- Owners: root
- Supersedes: —
- Superseded by: —

## Context

The accepted key hierarchy requires independently wrapped random keys, complete
item/blob encryption, stable associated data, bounded decoding, and portable
test vectors. A format must be fixed before crypto implementation so browser and
Node providers cannot make incompatible implicit serialization choices.

## Decision

Adopt the proposed `NTRN` version-1 fixed-header binary envelope in
`docs/protocol/crypto-envelope.md`. It uses Argon2id v1.3 for the local password
wrapper with the libsodium `crypto_pwhash`-compatible profile of 64 MiB, three
passes, and one lane; HKDF-SHA-256 with a fixed label registry for high-entropy
parent-key subkeys; and XChaCha20-Poly1305-IETF for every wrapper and payload.
The complete header, salt, and nonce are AEAD associated data. Payloads use a
reversible 0x80/zero padding rule and expose only a padded size class.

The recovery secret is a 32-byte CSPRNG value and derives only the recovery ARK
wrapper key. Root wrappers carry an ARK epoch and per-wrapper revision; ordinary
wrapper replacement is distinct from compromise-driven ARK rotation. A password
compromise requires a new password, a recovery-secret compromise requires a new
secret plus Task 0009 recovery-public-material rotation/revocation, and an
ARK-only compromise may retain other uncompromised authorities while creating
fresh wrappers. This is the minimum authority replacement; ARK exposure also
requires descendant-key rotation and payload re-encryption for forward
protection. This ADR deliberately does not choose the recovery
challenge-response construction; Task 0009 owns recovery authentication/signing
and must consume this label/format registry. Task 0004 owns account
mutation-signing material and its mutation transcript, public binding, and
rotation semantics.

Every kind-`0x03` wrapper has a 131-byte authenticated plaintext and 147-byte
ciphertext. It stores the actual inner material length and required zero padding
inside AEAD, preventing a server from learning whether the wrapper contains
variable-length mutation-signing material or a fixed-length vault key. Item and
index payload revisions are nonzero and begin at one; blob chunk numbers remain
zero-based.

## Alternatives considered

- Canonical CBOR: rejected for v1 because a small fixed header has fewer parser
  states, no duplicate-key rules, and deterministic bounds without a general
  object decoder.
- JSON/base64 envelopes: rejected because text parsing and multiple equivalent
  encodings add surface and obscure exact byte-level associated data.
- One raw parent key for every AEAD operation: rejected because labelled HKDF
  subkeys make cross-purpose use explicit and testable.
- A recovery secret derived from a human phrase: rejected because recovery is an
  independent high-entropy decryption authority, not another password.

## Security and privacy consequences

- The server sees envelope kind, opaque identifiers, key version, revision or
  chunk number, and padded ciphertext size. It does not see plaintext length.
- Unknown versions, suites, kinds, flags, reserved bytes, malformed sizes,
  invalid padding, and authentication failures fail closed with no plaintext.
- Password KDF parameters are authenticated and fixed to the maintained
  libsodium-compatible v1 profile. The client must never silently weaken or
  reinterpret them. Password bytes are strict, unnormalized UTF-8 with a
  1–1,024-byte bound.
- Random nonces are mandatory for each encryption under a given key. The format
  cannot make a broken RNG safe.
- The child wrapper does not reveal its encrypted material type: kind `0x03`
  has one fixed ciphertext length and canonical internal padding.
- Recovery authority replacement must replace the actually exposed authority;
  a new ARK wrapped by the same exposed password or recovery secret would not
  remediate compromise. Account-state monotonicity remains Task 0004 work.
- The mutation-signing-key inner encoding remains an explicit Task 0004
  dependency; its opaque bytes are not interpreted by the envelope parser.

## Operational and cost consequences

The fixed header keeps storage and implementation small. Password unwrap uses
64 MiB of memory and the single-lane provider call by default; it requires
browser benchmark confirmation, and a device that cannot meet the floor must
fail enrollment rather than downgrade.

## Compatibility and migration

Version 1 readers accept only version 1 and known critical values. A new format
version requires a new ADR, vectors, independent review, a write-new/read-old
migration plan, backup/restore evidence, and explicit retirement criteria. No
client may overwrite an envelope it cannot authenticate and parse.

## Verification

- Validate the draft JSON vector schema with a real JSON Schema validator; JSON
  parsing alone is insufficient.
- Implement the libsodium-compatible Argon2id and RFC 5869 HKDF known answers.
- Task 0005 must complete deterministic envelope, fixed-child-padding,
  authority/descendant rotation, generation, password-encoding, and mutation
  vectors before provider code ships or vectors become immutable.
- Independently review parsing, limits, AAD construction, labels, and migration
  behavior before this ADR is accepted.

## Primary-source implementation basis

- Libsodium's documented `crypto_pwhash` interface accepts output length,
  password bytes/length, salt, opslimit, memory limit, and algorithm identifier;
  it has no parallelism, secret, or associated-data argument. Its maintained
  Argon2id implementation invokes `argon2id_hash_raw` with lanes fixed to one:
  [interface](https://doc.libsodium.org/password_hashing/default_phf) and
  [implementation](https://github.com/jedisct1/libsodium/blob/master/src/libsodium/crypto_pwhash/argon2/pwhash_argon2id.c).
- RFC 9106 permits optional secret and associated-data inputs and publishes its
  Argon2id vector with four lanes; it therefore is not a known answer for the
  selected high-level provider call: [RFC 9106 §§3.1, 4, 5.3](https://www.rfc-editor.org/rfc/rfc9106.html).
