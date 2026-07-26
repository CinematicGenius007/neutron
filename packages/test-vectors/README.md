# Test-vector harness

`fixtures/crypto-envelope-v1.json` is the one synthetic, immutable v1 catalog.
Its SHA-256 digest is recorded in `fixtures/crypto-envelope-v1.sha256` and is
checked before Node verification. A catalog change requires a new catalog
version, a new digest, a protocol/compatibility review, and an independent
security review; it is never rewritten by a verifier.

The JSON Schema is validated with Ajv before any adapter sees a case. The
runtime-neutral `VectorVerifier` contract receives a supplied case and compares
its independently observed result with the catalog's exact expected outcome,
output, rejection code, and assertions. It provides no generation API.

Node verification currently executes schema, digest, catalog-coverage, and
adapter-contract tests. Browser verification is deliberately not claimed: the
repository has no production XChaCha20-Poly1305/Argon2id provider or browser
test runner. Once Task 0003's provider is implemented, its Node and actual
browser adapters must consume this unchanged catalog and execute its primitive,
envelope, and migration cases.
