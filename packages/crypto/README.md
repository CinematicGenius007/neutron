# Neutron crypto provider

This package is the runtime-portable primitive boundary selected by ADR 0003.
Call `createLibsodiumProvider()` and await it before use. The returned provider
offers only CSPRNG bytes, the fixed ADR-0010 Argon2id profile, HKDF-SHA-256,
XChaCha20-Poly1305-IETF, and best-effort mutable-buffer clearing.

The production AEAD API never accepts a generated nonce callback or a
deterministic nonce mode. Callers obtain nonces through `randomBytes(24)` and
the later envelope codec owns placement and uniqueness policy. Decryption maps
all tag failures to the single `authentication` failure code and returns no
partial plaintext.

## Bounds

- Password: 1–1,024 bytes; salt: exactly 16 bytes.
- Argon2id v1.3: 64 MiB, three passes, one lane, 32-byte output.
- HKDF-SHA-256: nonempty IKM, inputs at most 4,096 bytes, output 1–8,160 bytes.
- XChaCha20-Poly1305: 32-byte key, 24-byte nonce, 16-byte tag, bounded AAD and
  payload lengths sufficient for the v1 envelope maximum.
- Random byte requests: 1–16,777,216 bytes.

## Dependency provenance

`libsodium-wrappers-sumo@0.8.4` is pinned exactly. It is the ISC-licensed
JavaScript wrapper published from the official `jedisct1/libsodium.js`
repository and resolves through pnpm with registry integrity
`sha512-ql7hcgulKZ3ekfa2DGAogcCKsWU0diA/0nArz1CFzh93WQdb46/Kj18ka/Hifq6uA3Ush34Pc6vU/6HXeRwUkg==`.
Its pinned transitive WASM payload is `libsodium-sumo@0.8.4`, also ISC licensed
and from the same official repository, with registry integrity
`sha512-TMtHShQfVVsaxDygyapvUC3o7YsPgXa/hRWeIgzyFz6w5k/1hirGptCxp1U7XwW3rCskaTTYKgV10v86UiGgNw==`.
The sumo build is required for `crypto_pwhash` Argon2id support.

Provider tests validate the complete immutable catalog and its committed digest,
then run its applicable primitive cases through the production provider in Node
and real Chromium. Envelope encoding and semantic wrapper parsing remain in the
next bounded task.
