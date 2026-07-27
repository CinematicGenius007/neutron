# Test-vector harness

`fixtures/crypto-envelope-v1.json` is a synthetic **candidate executable
catalog**. It is the reviewed immutable v1 catalog and contains 83 fully
specified vectors: one HKDF-SHA-256 success,
one Argon2id success, six password-encoding cases, 13 state-generation cases,
58 envelope cases, and four cryptographic migration cases. There are 24
successes and 59 explicit rejections. The 35 `hardening-*` envelope cases expand
the original grouped requirements into individual ID, version, generation,
KDF, nonce, purpose, authenticated-plaintext, and per-kind bound probes. Its
SHA-256 digest covers this executable catalog only. Any change now requires a
new catalog version or an explicit reviewed correction. Fixture generation is separate:
`src/reference-generator.ts` is a test-only candidate generator and normal
verification never imports or invokes it.

`requirements/crypto-envelope-v1.pending.json` is a separate planning manifest,
validated by `schema/crypto-envelope-v1.pending.schema.json`. It contains only
the five Task-0010 Stage-3 authenticated-state records (two successes, three
rejections), which depend on Task 0004. Task 0005 has no pending records. A pending record has a
schema-required owner, blocking stage, dependency, success/rejection outcome, structured
document/heading references, missing-material requirements, and a reason it is
not executable. Pending and executable IDs are validated as disjoint and their
union covers 77 originating requirement IDs: the original 42 plus 35 explicit
parser-hardening probes. The manifest intentionally has no `expect` shape and
is never passed to `verifyCatalog`, included in the executable digest, or
counted as interoperability evidence.

The executable schema uses operation-discriminated branches for HKDF-SHA-256,
Argon2id, password encoding, envelope processing, state generation, and
migration. Every object is closed to unknown fields. Inputs use lowercase,
even-length hexadecimal where byte material is required. Password vectors use
pre-encoding Unicode scalar arrays or a schema-defined scalar repeat recipe;
adapters must reject surrogate/out-of-range
scalars, encode the accepted sequence as unnormalized UTF-8, and then apply the
byte-length rule. State counters use canonical decimal strings with a JSON-schema
and runtime-`BigInt` uint64 ceiling rather than unsafe JSON numbers. An
executable result is either exact output bytes, a canonical state result, or one
registered rejection error—never an assertion-only success or a mixed result.

State-generation requests have two closed, discriminated actions. `validate`
accepts only a candidate generation and checks its kind-local structural range:
root/item/index are `1..2^64-1`, while blob chunks are `0..16777215`.
`increment` accepts only a current generation and returns its exact successor,
rejecting uint64 overflow and blob successors above `16777215`. It does not
perform Task 0010's authenticated stale/replay or expected-successor checks.

The JSON Schema is validated with Ajv before any adapter sees a case. The
runtime-neutral `VectorVerifier` receives an operation-specific, copied, deeply
frozen request and compares its independently observed result with the catalog's
exact expected output, canonical state, or rejection code. It provides no
generation API. Canonical state comparison validates the full field set and is
independent of property insertion order.

The reference generator pins `@noble/ciphers@2.2.0` and
`@noble/hashes@2.2.0`, both MIT-licensed packages from the Noble Cryptography
repositories. It uses their documented XChaCha20-Poly1305, HKDF-SHA-256, and
Argon2id implementations with fixed synthetic inputs only. This is test
machinery, not the Stage 1 production provider.

`test/portable-reference-verifier.ts` is a separate implementation that imports
no generator code. It independently parses, derives, decrypts, validates,
rewraps, and compares all committed vectors. Envelope requests supply either
password UTF-8 bytes or a parent key; they never supply a prederived AEAD key,
so the Argon2 path and all seven HKDF labels remain observable. Migration
successes return exact length-delimited replacement-envelope bundles and make
no account-state activation claim.

The complete `envelope-recovery-root-wrapper` candidate was additionally
reproduced outside both TypeScript implementations: Node/OpenSSL HKDF-SHA-256
derived the recorded operation key and native libsodium 1.0.22 reproduced the
exact 51-byte XChaCha20-Poly1305 ciphertext. The derived-key value is retained
as a generator-test anchor.

Node verification executes the full portable adapter plus schema and manifest
validation, digest, schema-adversarial, catalog-boundary, and adapter-contract
tests. The same catalog, digest, schema, and portable adapter execute in a real
headless Chromium runtime through pinned `@vitest/browser-playwright@4.1.10`
(MIT) and `playwright@1.62.0` (Apache-2.0).

Task 0005 is complete after independent PASS review. Authenticated live-child-set,
stale/replay, atomic-activation, and public-binding vectors are separately
recorded in Task 0010 and do not block Stage 1.
