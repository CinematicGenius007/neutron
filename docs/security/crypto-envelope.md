# Crypto-envelope security requirements

Status: Proposed Stage 0 security companion to `../protocol/crypto-envelope.md`

## Security intent

The envelope format keeps complete vault item payloads, attachment bytes,
wrapped keys, and human-readable metadata inside authenticated encryption.
Only opaque IDs, version/revision counters, envelope kind, KDF parameters, and
padded size classes are visible to the untrusted service. `kind` describes a
cryptographic container, never an item type or filename.

The password wrapper is local-only authority: it derives a 32-byte key with
Argon2id and unwraps the random ARK. WebAuthn and future recovery challenge
messages do not receive the password, its Argon2 output, or a verifier. The
recovery secret is a separate 32-byte random local authority; its server-side
authentication construction is intentionally deferred to Task 0009. ADR 0011
defines its offline recovery-kit serialization and mandatory pre-initialization
confirmation. The checksummed kit is still a complete secret authority: it must
never be persisted with vault records, transmitted, logged, or treated as safer
to disclose because it has a checksum.

## Required enforcement points

- Generate every ARK, vault, item, attachment, recovery secret, salt, nonce,
  opaque ID, and random key with the browser/OS CSPRNG.
- Authenticate the complete envelope header, salt, and nonce as AEAD associated
  data before parsing decrypted content. Never use a header value before it has
  passed syntactic bounds checks.
- Enforce exact array length, nonzero IDs/versions, parser limits, canonical
  padding, known enum values, and the Argon2id policy floor before allocation or
  decryption. A malformed input has one fail-closed outcome and no plaintext.
- Derive a dedicated high-entropy subkey for each registered purpose. The only
  password-derived key is used directly for its single password-wrapper AEAD.
  Derive the kind-`0x03` `ark/child-key-wrap` key before decryption, then
  validate its authenticated encrypted material type, length, and canonical
  zero padding; never derive a key from encrypted content. Every kind-`0x03`
  ciphertext is 147 bytes so its inner material type is not size metadata.
- Before Argon2id, reject invalid Unicode input, encode valid Unicode scalar
  values as unnormalized UTF-8, and enforce the 1–1,024-byte password bound.
  JavaScript code must not rely on replacement-character behavior from
  `TextEncoder` for invalid surrogate handling.
- Do not include exact plaintext length in public header data. Use the 4 KiB
  padding rule; document its remaining size-class and traffic-analysis leakage.
- Keep key/version rotation and migration client-side. The API may persist or
  atomically replace ciphertext but must never unwrap, re-encrypt, or inspect it.
- During compromise-driven ARK replacement, authenticate and unwrap every live
  kind-`0x03` child with the old ARK, then re-wrap the same material under the
  new ARK in fresh canonical envelopes. The Task 0004 successor state must
  atomically contain the new root wrappers and complete child-wrapper set; do
  not activate a partial migration.
- Reject item/index `generation = 0`, blob chunk numbers above 16,777,215, and
  every uint64 overflow structurally. Task 0004, not the envelope parser,
  validates authenticated monotonic successor, stale, and replay behavior.

## Adversarial test matrix

| Attack | Required result |
| --- | --- |
| Flip/truncate/append any envelope byte | Structural or AEAD failure; no partial plaintext |
| Substitute account/object/version/kind/header between envelopes | AEAD failure |
| Reuse wrapper under another purpose or child-key type | AAD mismatch or authenticated post-decrypt type validation failure |
| Alter kind-`0x03` internal zero padding | Authenticated canonical-padding failure; no key material returned |
| Infer child key type from ciphertext size | Not possible for v1 kind `0x03`; all such ciphertexts are 147 bytes |
| Missing, malformed, or wrong-old-ARK child during ARK migration | Reject the entire migration; new ARK is not active |
| Partial root/child replacement state | Reject as non-atomic; retain the old active state |
| KDF downgrade or resource-exhaustion values | Reject before KDF execution |
| Unknown format, suite, kind, flag, type, or nonzero reserved byte | Reject without fallback |
| Noncanonical or absent padding marker | Reject after authentication |
| Wrong password/recovery secret/parent key | AEAD failure with no distinguishing secret error |
| Nonce reuse test fixture | Test generator rejects fixture; production API has no caller nonce override |
| Stale or unknown key version | Protocol-level fail closed; never rewrite the envelope |

## Key lifecycle and metadata impact

| Material | Create/use | Wrap/encrypt authority | Rotation/recovery |
| --- | --- | --- | --- |
| ARK | 32 random bytes, unlocked client only | password or recovery root wrapper | ordinary wrapper change retains ARK epoch; compromise creates a new ARK epoch, replaces each exposed authority, and atomically rewraps every live child under the new ARK |
| Vault/item/attachment keys | 32 random bytes per hierarchy node | parent-derived wrapper subkey | new key/version; old envelope retained only by migration policy |
| Item/blob/index payload | trusted-client plaintext | labelled child-key AEAD subkey | re-encrypt with new child key/version |
| Password key | local Argon2id output from strict UTF-8 bytes | one password root wrapper only | fresh salt and wrapper revision on ordinary password change; suspected exposure requires a new master password before the new ARK is wrapped |
| Recovery secret | 32 random emergency-kit value | recovery labelled subkey only | wrapper replacement increments its revision; suspected exposure requires a new secret and Task 0009 recovery-public-material rotation/revocation before it wraps the new ARK |

Root-wrapper records have independent, nonzero wrapper revisions and share the
ARK epoch they unwrap. The future Task 0004 authenticated account state commits
their active `(kind, arkEpoch, wrapperRevision, envelopeHash)` tuples so a client
can reject rollback after it has observed a newer state. This does not remove
the documented first-contact/fork limitation for a client with no authenticated
prior state. Mutation-signing material is Task 0004's separate responsibility;
recovery authentication material and signing remain Task 0009's separate
purpose.

Replacing root authorities plus rewrapping every live child under the new ARK is
the minimum action that both prevents a known old password or recovery secret
from unwrapping the replacement ARK and restores a functional hierarchy. It
does not protect a descendant key that an attacker already obtained. If the ARK
may have been exposed, forward protection also requires new descendant and
mutation-signing keys, new public mutation-signing bindings, and payload
re-encryption; historical copies already obtained by an attacker cannot be made
confidential again.

JavaScript/WASM memory cleanup remains best effort. The protocol does not claim
that a compromised unlocked client, malicious delivered client, or malicious
server withholding ciphertext cannot expose, delete, or withhold data.
