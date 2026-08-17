# Independent repository audit — 2026-08-15

Author: independent read-only audit session (`/root`)
Baseline: `main` at `12a2ee6` plus the **uncommitted TASK-0033 candidate**
Scope: what the repository is, what it demonstrably does, and what it does not
Data: synthetic only. No real credential, no network service, no deployment.

This record is evidence, not approval. It closes no task and approves no review
criterion. Every command below was run by this session on the working tree as it
stood, including the uncommitted TASK-0033 paths.

## 1. What Neutron is

A pnpm/TypeScript monorepo containing a **personal, self-hostable,
zero-knowledge secrets vault**, currently at Stage 2: an offline, single-device,
browser-local vault. There is no server, no network call, and no deployment in
this repository.

The shipped artifact is a static React 19 + Vite PWA under `apps/web`. It is
split across a hard window/worker trust boundary:

- The **window** owns UI only: React shell, item editor, styles.
- The **vault worker** owns every secret: enrollment, unlock, item CRUD,
  IndexedDB persistence, password/passphrase generation, TOTP computation.
- `vault-worker-protocol.ts` is the exact-shape message contract between them
  (currently internal protocol v2; v1 and mixed pairings are rejected outright).

Supporting packages: `@neutron/crypto` (libsodium WASM provider),
`@neutron/protocol` (v1 binary envelope, bech32m, recovery kit, migration),
`@neutron/vault-domain` (plaintext item schemas), `@neutron/test-vectors`
(cross-runtime known-answer fixtures).

`packages/sync-engine`, `packages/import-export`, `packages/ui`, and
`apps/api` are each a one-line `export {};` placeholder. Stages 3+ (passkeys,
sync, server, import/export, email aliasing, delivery hardening) have not begun.

### What a user can actually do today

Create a local vault with a master password; receive and confirm a bech32m
recovery kit; unlock and lock; create, read, update, and delete five item types
(login, secure note, TOTP, backup codes, JSON); generate random-character
passwords and EFF-wordlist passphrases; compute RFC 6238 TOTP codes; page
through items 24 at a time.

There is **no search, no sort, no clipboard copy, no import/export, no sync, no
idle auto-lock, and no offline service worker.**

## 2. Verification actually run by this audit

Working tree: `main` at `12a2ee6` with the uncommitted TASK-0033 candidate
(`apps/web/scripts/test-production.mjs`, `apps/web/src/app.tsx`,
`apps/web/src/item-editor.tsx`, `apps/web/src/styles.css`,
`apps/web/test/browser/app.browser.tsx`).

```text
pnpm typecheck                               pass
pnpm lint                                    pass; 110 files
pnpm format:check                            pass; 110 files
pnpm test                                    pass; 13 files, 110 tests
pnpm build                                   pass
pnpm --filter @neutron/web test:browser      pass; 4 files / 37 Chromium tests
                                                 + 3 files / 3 engine-matrix tests
pnpm --filter @neutron/web test:production   pass; "Verified 7 production files."
                                                 "Production CSP Chromium flow passed."
git diff --check                             pass
```

No retry was needed; the documented `IndexedDB deletion blocked` teardown flake
did not occur in this run.

Emitted production artifacts on this tree:

```text
dist/assets/index-Dnl4rwpz.js                317.23 kB (gzip 104.18 kB)
dist/assets/vault-worker-entry-BSdqlPuJ.js   663.18 kB
dist/assets/index-D_gZZYw-.css                12.48 kB (gzip 3.56 kB)
```

The CSS grew from the recorded 5,922 B baseline to 12.48 kB because of the
TASK-0033 token/hierarchy work. The worker byte size is unchanged from the
TASK-0031 checkpoint, consistent with the claim that TASK-0033 touches no worker
or crypto path.

`node --version` is v26.6.0 against a pinned `26.5.0`; pnpm emits an
`Unsupported engine` warning on every script. Gates still pass, but the pin and
the local toolchain disagree.

## 3. Cryptographic design — facts and external grounding

### 3.1 What the code does

- **AEAD**: XChaCha20-Poly1305-IETF, 32-byte key, 24-byte CSPRNG nonce,
  16-byte tag appended. `packages/crypto/src/libsodium-provider.ts:132`.
- **KDF**: Argon2id (`crypto_pwhash_ALG_ARGON2ID13`) with **m = 64 MiB,
  t = 3, p = 1**, 16-byte salt, 32-byte output.
  `docs/protocol/crypto-envelope.md:100-109`.
- **Key derivation**: HKDF-SHA-256, hand-built over libsodium's
  `crypto_auth_hmacsha256`, `salt = accountId`,
  `info = "neutron/derive/v1" || 0x00 || label || 0x00 || objectId ||
  uint32be(keyVersion)`. The extract/expand construction matches RFC 5869, and
  the expand loop is bounded at 255 × 32 bytes.
- **Associated data**: `"neutron/aead-ad/v1" || 0x00 || fixedHeader[0..71] ||
  salt || nonce` — every public header field, the salt, and the nonce are
  authenticated. `docs/protocol/crypto-envelope.md:113-122`.
- **Padding**: payload plaintext is padded to the next multiple of 4,096 with a
  `0x80` marker followed by zeros (ISO/IEC 7816-4 style). The unencrypted header
  deliberately carries no exact plaintext length.
- **Recovery kit**: bech32m encoding (BIP-350), which is the checksum variant
  chosen specifically to fix bech32's insertion/deletion weakness.
- **Key hierarchy**: password/recovery → account root key (ARK) → child keys →
  vault key → item key → attachment key, each wrapped in its own envelope kind
  with a distinct, non-reusable derivation label.

### 3.2 How the parameters compare externally

- OWASP's Password Storage Cheat Sheet gives an Argon2id **minimum** of
  19 MiB / t=2 / p=1, with 46 MiB / t=1 / p=1 as an equivalent alternative.
  Neutron's **64 MiB / t=3 / p=1 exceeds that minimum on both memory and time.**
- Bitwarden's Argon2id default is **64 MiB / t=3 / p=4**. Neutron matches its
  memory and iteration cost and differs only in parallelism. `p=1` is a
  reasonable choice for a single-threaded WASM build, but it is worth stating
  explicitly rather than leaving as an artifact.
- 1Password and Bitwarden's PBKDF2 defaults sit at 600,000 iterations of
  HMAC-SHA-256; Argon2id at these parameters is the stronger family.

**Fact worth recording in the security model:** ChaCha20-Poly1305 is an RFC
(8439). **XChaCha20-Poly1305 is not.** It exists only as
`draft-irtf-cfrg-xchacha-03`, which has expired. It is widely deployed
(libsodium, age, and others) and considered sound, but `SECURITY_MODEL.md` and
`docs/protocol/crypto-envelope.md` describe the suite without noting that the
project's only AEAD depends on a non-standardized construction. That is a
disclosure gap, not a break.

### 3.3 Where the crypto documentation is honest, and correctly so

The envelope specification is unusually disciplined for a personal project:
strict structural validation before any allocation or KDF invocation; explicit
rejection of every unassigned bit and reserved field; a compromise-rotation
procedure that distinguishes minimum ARK migration from full descendant
rotation; and an explicit statement that a fresh client without prior
authenticated account state remains exposed to server rollback and forking.

It also states plainly that it **requires independent cryptographic review that
has not happened**, and ADRs elsewhere record that JavaScript string erasure
cannot be guaranteed. Those admissions are the strongest signal in the
repository that the documentation is not marketing.

## 4. Findings

Severity is this audit's own judgement. Nothing here closes or opens a task.

### P1 — real gaps in a security product

**F1. No idle auto-lock.** An unlocked vault stays unlocked until the tab is
closed or **Lock now** is pressed. ADR-0016 is queued and has never started. For
a product whose entire threat model leans on "short unlock lifetime"
(`SECURITY_MODEL.md:64`), this is the largest functional gap between the stated
model and the shipped code.

**F2. The recovery kit is a usability trap.** Enrollment prints a 91-character
bech32m string and requires the user to **retype it exactly**, with no copy, no
download, no print, and no chunked/indexed grouping. Observed live this session:
`ntrk1…w509`, 91 characters, one unbroken run in a monospace `<output>`. The
predictable real-world outcomes are abandonment or a screenshot — the least safe
possible storage. The repository knows this ("the recovery-copy finding" is a
queued ADR), but the current state actively pushes users toward the unsafe path.

**F3. No independent-review evidence exists at the artifact level.** All 73
commits carry one Git identity
(`Ayush Saini <cinematicgenius007@Ayushs-MacBook-Air.local>`). The repository's
own `2026-08-01-multi-agent-integrity-audit.md` already records this. Restated
here because it bounds every "independent review PASS" in `HANDOFF.md`: those
are self-reported claims in prose, with no signature, no separate identity, and
no external attestation.

**F4. CI has never run.** ~~`git remote -v` returns nothing.~~ **Closed
2026-08-17.** At the time of the audit there was no remote and therefore no
GitHub Actions execution; `.github/workflows/ci.yml` was configuration only.

The user then configured `origin`, and `main` at `12a2ee6` was pushed. Run
[32044474328](https://github.com/CinematicGenius007/neutron/actions/runs/32044474328)
completed **success** on `ubuntu-24.04` in 2m16s, executing every step: frozen
install, typecheck, lint, format check, unit tests, build, pinned Playwright
engine install for Chromium/Firefox/WebKit, `test:browser`, and
`test:production`.

This is the first gate evidence in the project's history produced on a machine
other than the author's, and it closes the finding for `main`. Two limits on the
claim:

- The run validated `main` at `12a2ee6`. The TASK-0033 candidate and the
  proposed ADRs are on branch `task-0033-0035-experience-and-decisions` and have
  **no** CI run; a pull request has not been opened.
- The run reported a deprecation annotation: the three pinned action SHAs target
  Node.js 20 and are being forced onto Node.js 24. The pins are correct practice
  and should not be loosened, but they now need a deliberate bump. No task owns
  it.

### P2 — product and delivery gaps

**F5. Not yet usable as a password manager.** No clipboard copy means retrieving
a password requires revealing it on screen and selecting text by hand. No search
or sort with a 24-item page size and a 20,003-record store
(`apps/web/src/local-vault.ts:109`) means the vault becomes unnavigable well
before its own limit.

**F6. First load is heavy and uncached.** The worker bundle is 663.18 kB
(libsodium WASM inlined) with no code splitting. No service worker exists, and
`verify-build.mjs`'s artifact allowlist would fail the build if one were
emitted — so Stage 2 acceptance criterion A3 ("offline reload works") is
structurally impossible today, exactly as `HANDOFF.md` C2 states.

**F7. Stage 2 deliverable D5 is still missing.** `ROADMAP.md` requires a
schema-driven item-type registry; `item-editor.tsx` still hand-writes a
`switch (draft.type)` branch per type. Adding a sixth item type today means
editing three files by hand.

**F8. Node version pin drift.** `.node-version` / `engines` pin `26.5.0`; the
local toolchain is `26.6.0`, warning on every script invocation.

### P3 — design and hygiene

**F9. `font-family: Inter` is declared but never loaded.** No `@font-face`, no
network request — which is correct under ADR 0008 — but it means typography
silently differs between a machine that has Inter installed and one that does
not. Either ship nothing but the system stack, or state the intent.

**F10. Dark theme only.** `color-scheme: dark` is hardcoded with no
`prefers-color-scheme` handling and no light palette. `forced-colors` and
`prefers-reduced-motion` **are** handled (`styles.css:906`, `:937`), which makes
the missing light mode look like an oversight rather than a decision.

**F11. Two stale ADR filename reservations and two unexplained ADR number
gaps** (`HANDOFF.md` C3/C4) still have no owning task.

### What this audit did not find

No plaintext leakage. The exact-CSP production flow scans network, console,
static artifacts, IndexedDB, Cache Storage, local/session storage, history
state, and live DOM for sentinels, and passed on this tree. No third-party
runtime asset, font, script, or telemetry reaches an unlocked vault context. No
`any` at a trust boundary and no non-null assertions in the reviewed modules.
The three-leg validation discipline described in `CLAUDE.md` is genuinely
present across worker, response parser, and window broker.

## 5. Interface audit (live Chromium, synthetic data)

Measured this session against a local dev server at desktop 1280×720 and mobile
390×844 CSS pixels, on the TASK-0033 candidate.

- The unlocked **mobile** header spends 210 px before any content: a 78 px
  development notice plus a 132 px toolbar whose **Lock now** button is rendered
  full-bleed at 358 px wide in destructive pink. The most visually dominant
  element on the primary screen is the button that throws work away.
- The **create-item** form places `Tags, one per line` — a large multi-line
  textarea — third, above `Username` and `Password`. The advanced field
  outranks the actual credential.
- TASK-0033's progressive disclosure works: the generator is now a collapsed
  native `<details>`, and the mobile create-login page height is 1,346 px
  against the 1,836 px recorded pre-TASK-0033.
- The brand header scrolls away entirely once unlocked, so the vault's own
  identity and the safety notice compete for the same top-of-page attention.
- Item rows carry title plus type only; there is no visual distinction between
  item types beyond a text label.

## 6. Honest summary

The cryptographic core, the window/worker boundary, the exact-shape parsing
discipline, and the delivery policy are of a standard well above the typical
personal project, and the documentation is unusually careful about what it
cannot prove. What the repository does **not** have is (a) external validation
of any kind — no independent cryptographic review, no second Git identity, no
executed CI, and (b) the product surface that would make it usable: search,
clipboard, idle lock, import/export, offline reload, and sync.

The correct reading is: a rigorous, well-documented Stage 2 kernel with a
process that is more thorough than its own evidence chain can demonstrate.

## 7. Sources

- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP CheatSheetSeries issue #1183 — Argon2 and RFC 9106 values](https://github.com/OWASP/CheatSheetSeries/issues/1183)
- [Bitwarden — Encryption Key Derivation (KDF algorithms)](https://bitwarden.com/help/kdf-algorithms/)
- [RFC 8439 — ChaCha20 and Poly1305 for IETF Protocols](https://datatracker.ietf.org/doc/html/rfc7539)
- [draft-irtf-cfrg-xchacha-03 — XChaCha: eXtended-nonce ChaCha and AEAD_XChaCha20_Poly1305](https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-xchacha-03)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines)
