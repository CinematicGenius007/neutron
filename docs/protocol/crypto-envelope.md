# Neutron crypto envelope, version 1

Status: Proposed Stage 0 protocol; requires independent cryptographic review

This is the normative binary-envelope specification proposed by ADR 0010. The
requirements words MUST, MUST NOT, SHOULD, and MAY are normative. It describes
key wrappers and encrypted byte payloads, not the plaintext item schema,
signature construction, or recovery challenge transcript.

## 1. Common rules

All multi-byte integers are unsigned big-endian. `bytes[n]` is exactly `n`
octets. Concatenation is `||`. `ASCII(x)` is the exact US-ASCII byte sequence;
labels are case-sensitive. `0^n` is `n` zero octets. Implementations MUST use
constant-time AEAD verification supplied by a maintained crypto provider and
MUST NOT return unauthenticated or partially parsed plaintext.

`accountId` and non-root `objectId` are 16 CSPRNG octets. They are opaque, not
UUID text. A decoder MUST reject a zero `accountId`. Root wrappers use
`objectId = 0^16`; all other envelope kinds MUST reject `0^16` object IDs.

`keyVersion` is a nonzero uint32. For root wrappers it is the ARK epoch; both
current root wrappers for one ARK MUST carry the same epoch. For child-key
wrappers it is the wrapped child key's version. For payloads it is the key
version used for that payload. `generation` is a uint64 root-wrapper revision
for root wrappers, a uint64 ciphertext revision for item or index payloads,
and a uint64 chunk number for blob payloads. It is zero for child-key wrappers.
A root-wrapper revision starts at one and increments whenever that wrapper kind
is replaced. Item and index generations start at one for a new object/key
version and increment for every new ciphertext revision of that same
object/key-version pair. Blob chunk generations start at zero. Counter overflow
is an error, not wrap.

The only v1 suite is `0x01`: XChaCha20-Poly1305-IETF with a 32-byte key, a
24-byte random nonce, and its 16-byte authentication tag appended to the
ciphertext. Nonces MUST come from the platform CSPRNG and MUST NOT be
deterministic, counter-based, reused under one key, or accepted at any other
length.

## 2. Wire format

Every v1 envelope is exactly the following bytes, with no prefix, suffix, or
extension area:

| Offset | Bytes | Field | Allowed v1 value and purpose |
| ---: | ---: | --- | --- |
| 0 | 4 | magic | ASCII `NTRN` |
| 4 | 1 | format | `0x01` |
| 5 | 1 | kind | Table 1 |
| 6 | 1 | suite | `0x01` |
| 7 | 1 | flags | Table 1; all unassigned bits zero |
| 8 | 16 | accountId | opaque account binding |
| 24 | 16 | objectId | root zero or opaque target object |
| 40 | 4 | keyVersion | nonzero key-generation binding |
| 44 | 8 | generation | root-wrapper revision, payload revision, or chunk binding as above |
| 52 | 4 | ciphertextLength | tag-inclusive bytes after nonce; Table 1 bounds |
| 56 | 1 | kdf | `0x01` only for password ARK wrapper, otherwise `0x00` |
| 57 | 1 | kdfVersion | `0x13` for Argon2id, otherwise `0x00` |
| 58 | 1 | parallelism | Argon2 lanes or zero |
| 59 | 1 | reservedA | zero |
| 60 | 4 | memoryKiB | Argon2 memory or zero |
| 64 | 4 | iterations | Argon2 passes or zero |
| 68 | 1 | saltLength | 16 for password wrapper, otherwise zero |
| 69 | 1 | nonceLength | 24 |
| 70 | 2 | reservedB | zero |
| 72 | saltLength | salt | password-wrapper salt only |
| variable | 24 | nonce | AEAD nonce |
| variable | ciphertextLength | ciphertext | AEAD ciphertext followed by 16-byte tag |

The fixed header is 72 bytes. `ciphertextLength` is bounded before allocation,
and the byte-array length MUST equal `72 + saltLength + nonceLength +
ciphertextLength` exactly. A decoder MUST check all structural constraints,
including `reservedA`, `reservedB`, flags, lengths, and kind-specific fields,
before invoking a KDF or allocating ciphertext-sized memory.

### Table 1 — kinds and bounds

| Kind | Name | Flags | Plaintext / ciphertext rule | Key source |
| ---: | --- | ---: | --- | --- |
| 0x01 | password-ARK wrapper | 0 | ciphertext exactly 51 bytes | Argon2id output |
| 0x02 | recovery-ARK wrapper | 0 | ciphertext exactly 51 bytes | recovery HKDF subkey |
| 0x03 | ARK child-key wrapper | 0 | plaintext exactly 131 bytes; ciphertext exactly 147 bytes | labelled ARK subkey |
| 0x04 | vault child-key wrapper | 0 | ciphertext exactly 51 bytes | labelled vault-key subkey |
| 0x05 | item attachment-key wrapper | 0 | ciphertext exactly 51 bytes | labelled item-key subkey |
| 0x10 | item payload | 0x01 | ciphertext 4,112–16,777,232 bytes | labelled item-key subkey |
| 0x11 | blob chunk payload | 0x01 | ciphertext 4,112–1,048,592 bytes | labelled attachment-key subkey |
| 0x12 | index shard payload | 0x01 | ciphertext 4,112–65,552 bytes | labelled index-key subkey |

For root-wrapper kinds, `generation` MUST be nonzero; for child-key wrappers it
MUST be zero; and for every wrapper `flags` MUST be zero. For payload kinds,
`flags` MUST be exactly `0x01`, `ciphertextLength - 16` MUST be a positive
multiple of 4,096, and the unpadded plaintext limit is one less than the padded
limit. Item (`0x10`) and index (`0x12`) payloads MUST have a nonzero
`generation`; zero is structurally invalid. A blob is divided into at most
16,777,216 chunks, and its `generation` is zero-based and MUST be at most
16,777,215. The envelope parser validates those structural ranges; Task 0004
validates monotonicity, stale revisions, and replay against authenticated
account state.

The only v1 password-writer and reader profile is `kdf=0x01`,
`kdfVersion=0x13`, `parallelism=1`, `memoryKiB=65536`, `iterations=3`, and
`saltLength=16`. It maps exactly to libsodium's maintained
`crypto_pwhash(..., opslimit=3, memlimit=67108864,
crypto_pwhash_ALG_ARGON2ID13)` interface. A decoder MUST reject every other v1
KDF value before invoking the KDF; it MUST NOT silently lower or reinterpret a
request. A stronger profile, a different provider, or more than one Argon2
lane requires a new envelope version or a separately reviewed, versioned
provider profile with replacement vectors. All other kinds MUST set every KDF
field and salt length to zero.

## 3. Authentication data and padding

For every envelope, the AEAD associated data is exactly:

```text
ASCII("neutron/aead-ad/v1") || 0x00 || fixedHeader[0..71] || salt || nonce
```

`fixedHeader` includes the ciphertext length and KDF parameters. Thus every
public header value, salt, and nonce is authenticated. Encryption is
`XChaCha20-Poly1305-IETF-Encrypt(key, nonce, plaintext, aad)`; decryption MUST
use the exact same values and fail closed on any tag failure.

Payload plaintext is `P || 0x80 || 0^k`, where the total length is the smallest
positive multiple of 4,096 that can contain `P` plus the `0x80` marker. To
unpad, scan backward over zero octets, require one `0x80`, and return all
preceding bytes. A missing marker, a nonzero byte after it, or a size beyond the
kind limit is an error. Empty plaintext is valid. The unencrypted header
deliberately contains no exact plaintext length.

## 4. Wrapper plaintext and hierarchy

Root, vault-child, and attachment-child wrapper plaintext has this canonical
form:

| Bytes | Field | Rule |
| ---: | --- | --- |
| 1 | keyMaterialType | Table 2 |
| 2 | keyMaterialLength | big-endian; exact following length |
| variable | keyMaterial | raw bytes; exactly `keyMaterialLength` octets; no padding |

An ARK child-key wrapper (kind `0x03`) instead has exactly 131 plaintext bytes:

| Bytes | Field | Rule |
| ---: | --- | --- |
| 1 | keyMaterialType | Table 2 |
| 2 | keyMaterialLength | big-endian; Table 2 length for the type |
| variable | keyMaterial | exactly `keyMaterialLength` raw octets |
| remaining | internalPadding | exactly `128 - keyMaterialLength` zero octets |

The kind-`0x03` plaintext is `1 + 2 + 128 = 131` bytes and its ciphertext is
`131 + 16 = 147` bytes including the AEAD tag. Its encoder MUST append the
required zero octets and produce no other length. After successful AEAD
authentication, its decoder MUST reject an
unknown type, a type/length mismatch, any length outside 1–128, or a nonzero
`internalPadding` octet. The encrypted `keyMaterialLength` remains the only
source for locating the material; the fixed outer size deliberately prevents
the server from distinguishing mutation-signing material from a random vault
key by ciphertext length.

### Table 2 — wrapper contents

| Type | Meaning | Length | Permitted wrapper kind |
| ---: | --- | ---: | --- |
| 0x01 | account root key (ARK) | 32 | 0x01, 0x02 |
| 0x02 | account mutation-signing private material | 1–128 | 0x03 only |
| 0x03 | random vault key | 32 | 0x03 only |
| 0x04 | random item key | 32 | 0x04 only |
| 0x05 | random attachment key | 32 | 0x05 only |

The account mutation-signing bytes are opaque to this envelope specification.
Task 0004 MUST define their algorithm, canonical length, public-key
relationship, mutation transcript binding, rotation, and authenticated decoder
before any implementation writes type `0x02`. Task 0009 owns recovery
authentication/signing only and MUST use a separately allocated purpose; it
does not define or reuse this material. An envelope parser MUST still enforce
its 1–128-byte bound and leave semantic validation to Task 0004's authenticated
mutation-signing-key decoder.

ARK, vault, item, attachment, and recovery secrets are each exactly 32 CSPRNG
bytes. The password is never stored or sent. It is a sequence of Unicode scalar
values, not an implementation-native string: the client MUST reject unpaired
UTF-16 surrogates or any other invalid Unicode input before conversion; MUST
apply no normalization, case folding, trimming, newline conversion, or other
transformation; and MUST encode the accepted scalar sequence as RFC 3629 UTF-8.
U+0000 is encoded and counted normally. The encoded password MUST be 1 through
1,024 bytes inclusive, measured before Argon2id; otherwise creation and unlock
MUST fail before KDF invocation. JavaScript implementations MUST prevalidate
for surrogate code units because `TextEncoder` replaces them rather than
rejecting them. The resulting exact byte sequence is passed with its explicit
length to Argon2id, and its 32-byte result is used only for the password ARK
wrapper. The recovery secret is not a passphrase, is never sent to the server,
and is used only by the recovery-ARK derivation below. Derived and unwrapped key
bytes must be held only in the trusted client and cleared on a best-effort basis.

## 5. Derivation-label registry

For a 32-byte high-entropy parent key `IKM`, derive a 32-byte operation key as:

```text
PRK  = HKDF-Extract-SHA-256(salt = accountId, IKM)
info = ASCII("neutron/derive/v1") || 0x00 || ASCII(label) || 0x00 ||
       objectId || uint32be(keyVersion)
OKM  = HKDF-Expand-SHA-256(PRK, info, 32)
```

`accountId`, `objectId`, and `keyVersion` are the values encoded in the
envelope being processed. Labels may not be normalized, truncated, reused, or
constructed from user input. The only v1 labels are:

| Label | Parent key | Used by kind |
| --- | --- | --- |
| `recovery/ark-wrap` | recovery secret | 0x02 |
| `ark/child-key-wrap` | ARK | 0x03 |
| `vault/item-key-wrap` | vault key | 0x04 |
| `item/attachment-key-wrap` | item key | 0x05 |
| `item/payload-aead` | item key | 0x10 |
| `attachment/chunk-aead` | attachment key | 0x11 |
| `vault/index-shard-aead` | vault key | 0x12 |

Kind `0x03` always uses `ark/child-key-wrap`, before attempting AEAD
decryption. A decoder MUST authenticate and decrypt first, then validate the
fixed-length wrapper's encrypted `keyMaterialType`, length, and canonical zero
padding; it MUST NOT select a derivation label from encrypted data. All other
kinds have the one label shown. The password wrapper is deliberately the exception:
its Argon2id output is used directly once, while its kind and full header are
still AEAD-bound. No label is reserved for export, session, authentication, or
mutation signing; those protocols must allocate labels in a later ADR.

## 6. Generation, rotation, and migration

Writers create a new random nonce on every encryption and a new random salt on
each password-wrapper creation. A root-wrapper replacement also increments that
kind's `generation` while retaining the active ARK epoch in `keyVersion`.

An ordinary password change, after successful local unlock, reuses the ARK and
creates a fresh password wrapper with a new salt, nonce, and password-wrapper
revision. It is only safe when the previous password is not suspected to be
compromised. Recovery-secret replacement similarly creates a new recovery
wrapper revision for the existing ARK. A client MUST atomically replace the
active record for that wrapper kind and retain the previous revision only in an
encrypted backup/migration journal, never as another active unwrap authority.

Suspected exposure of a password, recovery secret, or ARK is a compromise
rotation, not an ordinary rewrap. It starts with a new random ARK at the next
ARK epoch and fresh root wrappers/nonces (and a fresh password-wrapper salt).
The minimum authority replacement depends on what was exposed:

- For a suspected password exposure, the user MUST choose a new valid master
  password before wrapping the new ARK. The old password MUST NOT wrap it.
- For a suspected recovery-secret exposure, the client MUST generate a new
  32-byte recovery secret before wrapping the new ARK. The old recovery secret
  MUST NOT wrap it, and Task 0009 MUST rotate or revoke its corresponding
  recovery-authentication public material before the replacement is active.
- For an ARK-only exposure, an otherwise uncompromised password and recovery
  secret MAY be retained, but the new ARK still requires fresh wrappers,
  nonces, and the password-wrapper salt.
- When more than one authority may be exposed, every corresponding authority
  MUST be replaced before it wraps the new ARK.

This minimum root-authority replacement prevents a known old password or
recovery secret from immediately unwrapping the replacement ARK. It does not
by itself make a new ARK functional: every live kind-`0x03` child wrapper is
encrypted with a subkey derived from the old ARK. The trusted client MUST
complete this minimum ARK migration while it still holds the old ARK:

1. Authenticate and decrypt every live kind-`0x03` wrapper using the old ARK.
   Reject the migration if any required wrapper is missing, unauthenticated,
   malformed, noncanonical, or cannot be unwrapped.
2. Re-wrap the same authenticated child key material under the new ARK in a
   fresh canonical kind-`0x03` envelope with a fresh random nonce. Preserve the
   child `objectId` and child `keyVersion` when the key material itself is not
   being rotated. The new parent IKM binds the wrapper to the new ARK; the
   atomic successor account state binds the complete child-wrapper set to the
   new ARK epoch.
3. Include account mutation-signing private material in this rewrap without
   changing its public identity or binding during this minimum migration.
4. Atomically commit the fresh password/recovery root wrappers and the complete
   replacement child-wrapper set through Task 0004's authenticated account-state
   protocol. The new ARK MUST NOT become active unless that complete successor
   state is accepted.
5. Only after successor acceptance, retire the old active root and child
   wrappers according to the encrypted backup and retention policy. Clear the
   old ARK and temporary plaintext child-key material on a best-effort basis.

Minimum ARK migration restores a functional hierarchy, but it does not provide
forward protection if the old ARK or descendant keys were exposed. Full
post-ARK-compromise rotation additionally generates new vault, item, attachment,
and mutation-signing keys; updates mutation-signing public bindings under Task
0004; rewraps the new hierarchy; and re-encrypts every live payload. It cannot
make ciphertext or plaintext copies already obtained by the attacker
confidential again.

The authenticated account-state/mutation protocol in Task 0004 MUST commit the
active root-wrapper tuple `(kind, arkEpoch, wrapperRevision, envelopeHash)` and
clients MUST retain the highest authenticated revision they have accepted.
Rollback to a lower authenticated revision is rejected. A fresh client without
a previously authenticated account state remains subject to the documented
server rollback/fork limitation; recovery authentication remains Task 0009's
separate purpose. A server cannot perform any rotation because it lacks every
parent key.

Child-key rotation increments `keyVersion`, uses a new random key, writes the
new authenticated envelope, and retains the old version only under the
specified migration/retention policy. For a new item or index key version, the
first payload ciphertext has `generation = 1`; later ciphertext revisions of
that same object/key-version pair increment it by one. Envelope decoding only
checks the nonzero uint64 range. Task 0004 owns checking that a received
revision is the expected monotonic successor and rejecting stale, duplicate, or
replayed account state.

Version 1 implementations MUST reject any other format, suite, kind, flag bit,
reserved value, unknown key material type, or malformed trailing data. A future
version requires a new ADR, vectors, independent review, an explicit reader
compatibility matrix, authenticated write-new/read-old migration, external
encrypted backup before destructive cleanup, and a rollback story. Unknown
critical data must remain opaque; clients MUST NOT rewrite it.

## 7. Test-vector requirements

`packages/test-vectors/schema/crypto-envelope-v1.schema.json` is a **draft**
portable vector document, not an immutable catalog or a substitute for schema
validation. Values are lowercase unprefixed hexadecimal unless a case explicitly
tests Unicode password input; all fixtures are synthetic. Implementations MUST
run primitive known answers, deterministic envelope encrypt/decrypt cases with
supplied keys/nonces, and negative cases for each rejected mutation. No vector,
test log, or error may contain production credentials or key material.

The draft contains only seed known answers and structural examples. Task 0005
MUST define the executable JSON Schema validation step, a generator/verification
separation, catalog completeness, fixture versioning, and the immutability rule
before implementation accepts vectors as stable. It MUST add deterministic
vectors for every kind and label, both root wrappers, root-wrapper revisions and
authority/descendant compromise rotation, fixed kind-`0x03` internal-padding
acceptance and rejection, one padded boundary for each payload kind, item/index
generation zero and successor rejection, all documented parser failures, and
password conversion (valid multi-byte/NUL input, invalid Unicode,
normalization distinction, and byte-length limits). Invalid-Unicode vectors
MUST use explicit UTF-16 code units or bytes with defined adapter semantics,
never a lone surrogate embedded in JSON text. It MUST additionally cover a
successful minimum child-key rewrap; missing, wrong-old-ARK, and malformed
child-wrapper failures; partial/non-atomic migration rejection; and the
difference between functional minimum rewrap and full descendant rotation. JSON
parsing alone is not schema validation.
