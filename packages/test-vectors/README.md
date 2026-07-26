# Test-vector harness

`fixtures/crypto-envelope-v1.json` is a synthetic **candidate** catalog. Its
SHA-256 digest is checked before Node verification, but immutability begins only
after the catalog is complete and independently approved. Fixture generation is
separate: `src/reference-generator.ts` is a test-only candidate generator and
normal verification never imports or invokes it.

The JSON Schema is validated with Ajv before any adapter sees a case. The
runtime-neutral `VectorVerifier` contract receives a supplied case and compares
its independently observed result with the catalog's exact expected outcome,
output, rejection code, and assertions. It provides no generation API.

The reference generator pins `@noble/ciphers@2.2.0` and
`@noble/hashes@2.2.0`, both MIT-licensed packages from the Noble Cryptography
repositories. It uses their documented XChaCha20-Poly1305, HKDF-SHA-256, and
Argon2id implementations with fixed synthetic inputs only. This is test
machinery, not the Stage 1 production provider.

Node verification currently executes schema, digest, catalog-coverage, and
adapter-contract tests. Browser verification is deliberately not claimed until
the real-browser harness can run in this environment; that limitation is not a
production-provider dependency.
