# Starting Prompt — Project Neutron

> Feed this entire prompt to an LLM to generate the full initialization & implementation plan.

---

You are a senior staff engineer and security architect specializing in zero-knowledge systems and email infrastructure. I want you to produce a comprehensive **initialization and implementation plan** for a personal project called **Neutron** (working name, org "nebula"). Do not write code yet — produce the master plan. If anything below is ambiguous, list your clarifying questions FIRST and wait for my answers before planning.

## 1. Background & intent

This is a **personal, self-hosted project** (solo developer, not a company, not a public SaaS — but design so it *could* be multi-user later). The goal is to build my own version of the Proton services I actually use: **a secrets manager (like Proton Pass) and email with disposable aliases (like Proton Mail + SimpleLogin)**. Not the whole Proton suite — no calendar, drive, or VPN.

Core philosophy, in my own words: **"Do not trust anyone or anything."** Secrets are decrypted only on the client; the server stores and transports nothing but ciphertext. I want to deeply understand and own the security model, not just glue services together.

## 2. Product vision & phases

**Phase 1 — Vault (secrets manager), web-first:**
- Save many secret types: logins, email accounts, 2FA/TOTP seeds (with code generation), backup codes, addresses, cards, bank details, arbitrary JSON blobs, identity documents.
- **All fields encrypted** (not just the password field — usernames, URLs, notes too), decrypted only on the client. Server is a dumb ciphertext store.
- Secure export (take an encrypted dump out) and secure import (upload a dump in), ideally including import from Bitwarden/1Password/Proton Pass formats.
- Start as a website; then mobile. First evaluate whether an installable PWA is "good enough" vs native Android → iOS apps. Recommend a path.

**Phase 2 — Mail:**
- Basic, usable mailbox for me.
- Bring-your-own domains: I add my domains, verify them, create real addresses on them.
- Disposable aliases: auto-generated forwarding addresses that never expose my real address, can be deleted/disabled at any time, and ideally support **reverse-alias** (I can reply/send *from* the alias without leaking the real address) — the SimpleLogin/addy.io model.
- Inbound mail should be encrypted at rest with my public key so the server operator (me, but still) can't read stored mail.

**Phase 3 — Later (design for, don't build):**
- Browser extensions for all major browsers (autofill, alias generation).
- A terminal/CLI surface for the vault (and maybe mail). Architecture must allow a CLI to reuse the core crypto/sync logic.

**Explicit non-goals for now:** sharing/teams/family plans, public registration, calendar/drive/VPN, mobile-native polish, anything that conflicts with zero-knowledge.

## 3. Non-negotiable security invariants

1. The server **never** sees plaintext secrets, plaintext keys, or password-equivalent material.
2. Authentication must not reveal the password to the server even if the server is malicious — evaluate **OPAQUE (aPAKE)** vs hardened **SRP-6a** (Proton's choice), and **passkeys/WebAuthn** for unlock. Recommend one, with rationale.
3. Key hierarchy worth evaluating (Proton Pass model): master password → memory-hard KDF (Argon2id) → user keypair → per-vault keys → per-item keys, envelope encryption throughout. All crypto client-side (evaluate libsodium via WASM vs native WebCrypto).
4. Never roll custom primitives; every crypto choice needs cited rationale and concrete parameters (KDF costs, key sizes, AEAD scheme).
5. Metadata minimization: encrypt item *types*, URLs, and filenames where feasible; be honest about what metadata inevitably leaks (timestamps, sizes, IP logs) and document it.
6. The plan must include a real **threat model**: malicious server, compromised client, network MITM, stolen database, lost device, coercion/forgotten password.

## 4. Prior art to study and reference

- **Proton Pass security model** — SRP auth, bcrypt-wrapped user key, AES-256-GCM vault/item keys, full-field encryption. (proton.me/blog/proton-pass-security-model)
- **Bitwarden** — zero-knowledge, PBKDF2/Argon2 options, open source; good reference for import/export formats.
- **SimpleLogin** (github.com/simple-login/app, AGPL-3.0) — open-source, self-hostable alias forwarding: Postfix + Postgres, PGP-encrypted mailbox, custom domains, reverse aliases, browser extensions. Serious question for the plan: **fork/deploy SimpleLogin for Phase 2 vs build from scratch** — analyze honestly.
- **addy.io, Firefox Relay, Apple Hide My Email, DuckDuckGo Email Protection** — alias UX patterns worth stealing.
- **Cloudflare Email Routing / Email Sending** — managed inbound routing into Workers + outbound transactional sending; a possible middle path between "run Postfix on a VPS" and "fully managed," with tradeoffs on privacy and lock-in.
- Mail reality check: running your own SMTP is the hardest part — SPF/DKIM/DMARC, port 25, IP reputation, spam-fold placement. The plan must have a concrete deliverability strategy, not hand-waving.

## 5. Hard problems the plan MUST address head-on

- Account recovery with zero-knowledge: recovery codes / wrapped-key escrow — without the server being able to decrypt.
- Master password change = re-wrap keys, not re-encrypt everything; rotation story.
- Client-side vault search/sorting without decrypting everything into an unbounded memory footprint.
- TOTP code generation from encrypted seeds, entirely client-side.
- Secure import pipeline (untrusted CSV/JSON parsing is an attack surface) and encrypted export format (versioned, AEAD-authenticated).
- Trusting the web client: a malicious/compromised server could serve backdoored JS. Acknowledge this honestly and present mitigations (PWA install + update pinning, eventual extension with signed builds, SRI/code-transparency thinking) — this is the known weak point of every web-based zero-knowledge product.
- Alias↔mailbox unlinkability in the database schema; clean deletion semantics for aliases.
- Inbound pipeline for aliases: receive → optionally PGP-encrypt to my key → forward/store; outbound: send-as-alias without exposing the origin address.
- What breaks when I lose my master password (answer should be "everything, by design") — and what recovery UX is acceptable.

## 6. Candidate directions to evaluate (recommend with tradeoff tables; don't just list)

- **Web:** Next.js PWA with an isolated, audited client-crypto module; nothing secret ever leaves the client.
- **Backend:** options across TypeScript (Node/Workers), Go, or Rust; Postgres as source of truth; object storage for mail blobs. Optimize for: boring, auditable, self-hostable on one VPS, low ops burden.
- **Crypto core:** single shared library usable from web, future CLI, and future mobile (evaluate Rust core + WASM/FFI vs TypeScript core). This decision shapes the whole repo.
- **Mobile:** PWA-first vs React Native/Expo vs native; biometric unlock + secure enclave/keystore key caching without weakening the model.
- **Mail:** (a) fork SimpleLogin, (b) self-host Postfix/Dovecot built my way, (c) Cloudflare Email Routing + Workers logic + SMTP relay for sending. Compare privacy, ops burden, deliverability, learning value.
- **Repo:** monorepo layout separating crypto core, API, web, future cli/, extension/.

## 7. Required structure of the plan you produce

1. Executive summary + product principles
2. Threat model & security invariants
3. Cryptographic design (key hierarchy, KDF params, envelope format, versioning/migration path)
4. System architecture — components, trust boundaries, data-flow diagrams (ASCII fine)
5. Server data model (schema of what the server *can* see — ciphertext blobs + minimal metadata)
6. API surface (auth handshake, vault sync, alias CRUD, mail flows) — endpoints + contracts
7. Technology decision log — chosen vs alternatives, with tradeoff tables and rationale
8. Phased roadmap: Phase 0 foundations → vault MVP → PWA/mobile hardening → import/export → aliases → full mail → extensions → CLI. Each milestone needs acceptance criteria.
9. Testing & verification strategy: crypto test vectors, E2E, adversarial review checklist, how I validate the zero-knowledge claims myself
10. Ops plan: self-hosting topology, backups (of ciphertext), monitoring, rough monthly cost
11. Risk register + open questions that only I can answer

## 8. Rules for your response

- Ideate: propose differentiators and features I didn't list (e.g., password generator, breach alerts via k-anonymity, alias-per-service conventions, emergency kit PDF, dead-man considerations) — but clearly mark them optional and keep scope honest; this is one person's project.
- Prefer simple, boring, auditable designs over clever ones. Say "don't build this yet" wherever justified.
- Where my requirements conflict with security or simplicity, challenge them explicitly.
- No code. Decisions, diagrams, and structure only.
