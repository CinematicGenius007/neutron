# Test-vector harness

`fixtures/crypto-envelope-v1.json` is a synthetic **candidate executable
catalog**. It currently contains six fully specified vectors: one HKDF-SHA-256
success, one Argon2id success, two password-encoding successes, and two
password-encoding rejections. Its SHA-256 digest covers this executable catalog
only; immutability begins only after the catalog is complete and independently
approved. Fixture generation is separate: `src/reference-generator.ts` is a
test-only candidate generator and normal verification never imports or invokes
it.

`requirements/crypto-envelope-v1.pending.json` is a separate planning manifest,
validated by `schema/crypto-envelope-v1.pending.schema.json`. It contains 36
pending requirements: two password-encoding (one success, one rejection), 23
envelope (nine successes, 14 rejections), five state-generation (two successes,
three rejections), and six migration (two successes, four rejections). A pending
record has stable references, missing-material requirements, and a reason it is
not executable; it intentionally has no `expect` shape and is never passed to
`verifyCatalog`, included in the executable digest, or counted as
interoperability evidence.

The executable schema uses operation-discriminated branches for HKDF-SHA-256,
Argon2id, password encoding, envelope processing, state generation, and
migration. Every object is closed to unknown fields. Inputs use lowercase,
even-length hexadecimal where byte material is required; state counters use
bounded decimal strings rather than unsafe JSON numbers. An executable result is
either exact output bytes, a canonical state result, or one registered rejection
error—never an assertion-only success or a mixed result.

The JSON Schema is validated with Ajv before any adapter sees a case. The
runtime-neutral `VectorVerifier` receives an operation-specific, copied, deeply
frozen request and compares its independently observed result with the catalog's
exact expected output, canonical state, or rejection code. It provides no
generation API.

The reference generator pins `@noble/ciphers@2.2.0` and
`@noble/hashes@2.2.0`, both MIT-licensed packages from the Noble Cryptography
repositories. It uses their documented XChaCha20-Poly1305, HKDF-SHA-256, and
Argon2id implementations with fixed synthetic inputs only. This is test
machinery, not the Stage 1 production provider.

Node verification currently executes schema and manifest validation, digest,
schema-adversarial, catalog-boundary, and adapter-contract tests. Browser
verification is deliberately not claimed until the real-browser harness can run
in this environment; that limitation is not a production-provider dependency.

Remaining blockers are concrete reviewed envelope and migration bytes (including
base-vector-plus-mutation recipes) and real-browser execution of the committed
executable catalog. This candidate catalog is not immutable.
