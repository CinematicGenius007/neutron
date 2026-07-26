# Detailed threat and metadata model

Status: Stage 0 design input; not a protocol specification  
Last reviewed: 2026-07-26

This turns the baseline model into testable requirements. It does not choose the
envelope or recovery-authentication constructions reserved for Tasks 0003 and
0009. A stated control is a future requirement, not a claim that it exists now.

## Classification vocabulary

| Class | Meaning and handling |
| --- | --- |
| Public metadata | Protocol, routing, or operational information not intended to be secret. Minimize it, use opaque identifiers, and document retention. |
| Ciphertext | Authenticated encrypted vault or stored-mail bytes and their integrity-bound envelope. The service may store or transport it but never decrypt it. |
| Operational secret | A value enabling an operational action or exposing private routing, but not a vault decryption key. Restrict and redact it from logs, errors, traces, and fixtures. |

Public metadata can still permit correlation. Public nonce/header bytes are part
of their ciphertext envelope and must remain integrity-bound to it.

## Trust-boundary flows

| Flow | Client processing | Service/infrastructure receives | Must never cross |
| --- | --- | --- | --- |
| Offline initialization | Browser CSPRNG creates ARK, signing/vault keys, salts, and recovery material; crypto worker derives password key and creates wrappers after recovery-kit confirmation. | Nothing; IndexedDB receives encrypted envelopes only. | Master password, ARK, recovery secret, plaintext keys, item plaintext. |
| Unlock/lock | Crypto worker derives password key and unwraps ARK locally while unlocked; UI gets only necessary plaintext; cleanup is best effort. | Nothing. | Password, derived key, ARK, plaintext items, password verifier. |
| Online enrollment | Client creates WebAuthn credential, encrypted account material, and validates returned bindings. | WebAuthn public material, future recovery public material, ciphertext wrappers, signed initial head, opaque IDs. | Password, recovery secret, ARK, signing private key, vault key, vault plaintext. |
| Sync/blob transfer | Client encrypts/signs data and validates signatures, heads, AEAD, and schemas before encrypted local persistence. | Sessions, opaque IDs, cursors, signatures, padded sizes, ciphertext envelopes, retry metadata. | Item type/title/username/URL/notes/tags/filenames, TOTP seeds/codes, search query, import content, plaintext keys. |
| Password change | Client derives a new password key and re-wraps the existing ARK. | New KDF metadata and ciphertext wrapper with expected version. | Old/new password, either derived key, ARK, item plaintext. |
| Recovery | Offline kit performs the future specified challenge-response and locally unwraps ARK. | Recovery public material, bounded challenge/replay data, authorized replacement wrapper. | Recovery secret/derived key, ARK, vault plaintext. |
| Import/export | Isolated local worker parses imports offline; export encrypts a streaming container under an independent export key. | Nothing for source imports/local export creation. | Import file/plaintext, export passphrase, decrypted entries/attachments. |
| Mail, later | Routing/spam policy processes SMTP; accepted raw MIME is encrypted before storage. | Mail plane temporarily sees SMTP content and routing; storage receives encrypted MIME plus metadata. | Vault keys, vault mutation authority, or a zero-knowledge SMTP claim. |

The web origin is conditionally trusted. A malicious delivered client can capture
secrets before cryptography applies; server-side encryption cannot remove this
risk.

## Server-visible field inventory

This covers every conceptual record in `../ARCHITECTURE.md`. New fields require
a class, retention rationale, and this inventory update before implementation.

| Record | Field(s) | Class | Constraint |
| --- | --- | --- | --- |
| Account | Opaque account ID; protocol version; creation/update/operational timestamps | Public metadata | Stable correlation and timing only; never a human-readable account name. |
| Credential | Opaque credential ID; WebAuthn public key; counter, flags, transports, backup state | Public metadata | Authentication material/device capability, never a vault key. |
| Recovery enrollment | Recovery public authentication material; version; lifecycle timestamps | Public metadata | Task 0009 must ensure it reveals no recovery secret or server decryption ability. |
| Auth challenge | Challenge ID, account binding, expiry, replay state, rate-limit result | Public metadata | Do not disclose enumeration details; transient challenge is never durable vault data. |
| Session | Account ID, scope, issued/expiry/revocation time, hashed session ID | Public metadata | Enables timing/correlation; store no raw token. |
| Session | Raw bearer token when presented in request/cookie | Operational secret | Redact everywhere; server persistence holds only its verifier/hash. |
| Rate limiter | Bucket keys, counters, windows, abuse decision, source IP/coarse network data | Public metadata | Privacy-sensitive operational metadata; minimize retention. |
| Key envelope | Account/object ID, purpose, envelope/key version, KDF parameters, salt, nonce | Public metadata | Integrity-bind every value to the wrapper; none is a plaintext key. |
| Key envelope | Wrapped-key ciphertext | Ciphertext | Contains wrapped key material only; server never unwraps it. |
| Vault object | Opaque object ID, owner, revision, padded size, nonce | Public metadata | Reveals linkage and size class only; IDs cannot carry human item metadata. |
| Vault object | Wrapped item key and encrypted payload | Ciphertext | Full item content—including type and human metadata—is inside authenticated encryption. |
| Sync operation | Cursor, operation ID, prior/expected/signed head, ciphertext hash, signature, operation kind, idempotency key, timestamps | Public metadata | Operation kind cannot encode human item type. |
| Sync operation | Encrypted mutation and conflict-copy bodies | Ciphertext | Server validates bounds/signature/concurrency without plaintext interpretation. |
| Tombstone | Opaque ID, signed deletion operation, retention deadline, cursor, timestamps | Public metadata | Deletion timing/linkage visible; reason/content encrypted. |
| Blob | Opaque ID, owner, padded size, ciphertext hash/integrity data, storage key, retention/timestamps | Public metadata | IDs cannot embed filename or content type. |
| Blob | Encrypted attachment bytes and attachment-key metadata | Ciphertext | Decryption only in a trusted client. |
| Logs/errors | Request ID, status class, bounded endpoint/operation labels, redacted counters | Public metadata | Never log bodies, tokens, ciphertext dumps, plaintext, keys, imports, or mail content. |
| Mail routing, later | Alias/domain, envelope addresses, destination mapping, delivery/bounce/spam state, policy headers, timestamps, sizes | Operational secret | Separate database/access boundary; minimize retention. |
| Stored mail, later | Raw MIME after required plaintext processing | Ciphertext | Encrypt before persistence; SMTP plaintext remains visible to the mail plane. |

No server column may contain plaintext vault item type, title, URL, username,
filename, tag, folder, search term, import source, or password-equivalent login
material. The master password must never authenticate to the server.

## Lifecycle traces

| Lifecycle | Required trace | Future test evidence |
| --- | --- | --- |
| Enrollment | Local vault and recovery-kit confirmation precede WebAuthn enrollment; server gets public authentication material plus ciphertext only. | Captured traffic/server fixtures contain no password, verifier, ARK, recovery secret, private key, or plaintext field. |
| Unlock | Password enters local worker; derived key locally unwraps ARK; lock ends active use. | No network request; persistence has no synthetic plaintext or ARK. |
| Password change | New local salt/password key re-wraps same ARK; server uses expected-version concurrency. | Item ciphertext unchanged; stale wrapper replacement rejected. |
| Recovery | Offline kit authenticates a bounded challenge and locally unwraps ARK. | Task 0009 fixed vectors plus replay, expiry, wrong-account, and rotation failures. |
| Device loss | Locked storage is encrypted; sessions/devices can be revoked by another credential or recovery. | Storage scan plus session-revocation test; browser-memory limits documented. |
| Rollback/fork | Client remembers signed head and compares history when possible. | Stale, forged, reordered, mismatched-head mutations rejected; fresh-client/fork limit documented. |
| Deletion | Client emits signed tombstone and server retains it for a bounded documented period. | Retry, stale-head, retention, and resurrection-prevention tests. |
| Key rotation | Versioned wrappers/keys bind purpose and version; rotation never makes server a decryptor. | Mixed-version, migration, and unknown-version fail-closed vectors. |

## Attacker stories

| Threat | Capability and asset | Required control | Residual risk | Testable check |
| --- | --- | --- | --- | --- |
| Database theft | Reads records/blobs/backups; targets items and keys. | Random keys, Argon2id ARK wrapper, AEAD, padding, no plaintext columns. | Weak passwords, timing/count/size/ID metadata. | Synthetic full dump has no recognizable plaintext; altered envelope fails authentication. |
| Malicious server | Modifies, withholds, deletes, replays, or equivocates data. | AEAD, signed append-only mutations, expected/local heads, idempotency, client conflict copies. | Fresh-client rollback, isolated device fork, deletion/withholding. | Forged, altered, duplicate, stale, and reordered commits fail closed. |
| Network MITM | Observes/modifies traffic; targets sessions/integrity. | TLS, WebAuthn origin binding, short sessions, AEAD, signatures. | Compromised origin/client/CA ecosystem. | Captures lack plaintext/password/keys; invalid authentication transcript rejected. |
| Malicious web release | Delivered script reads local secrets. | No third parties, CSP/Trusted Types, pinning, reproducible signed releases, isolated worker. | Compromised trusted origin still steals plaintext. | Header/dependency/build checks; limitation stated in release review. |
| Compromised unlocked client | Malware/keylogger/extension reads UI or memory. | OS/browser isolation, brief unlock, least plaintext, session/device revocation. | Not fully mitigable while unlocked. | Lock/revocation tests and no secure-erasure claim. |
| Lost locked device | Reads local media/storage. | Encrypted IndexedDB, no persisted ARK, device lock, revocable sessions, recovery. | OS compromise/memory remnants. | Storage scan has no fixtures; revocation blocks access. |
| Recovery theft | Steals emergency kit. | High entropy, offline custody warning, physical separation option, replay-safe future protocol. | Recovery material is deliberately alternative decryption authority. | Valid synthetic-kit drill; replay/expiry/wrong-account/rotation rejection. |
| Rollback/fork | Presents divergent valid histories. | Signed heads, local memory, comparison where possible, conflict copies. | No MVP transparency service; non-comparing devices may remain forked. | Two-client adversarial history detects comparable-head mismatch. |
| Import attack | Supplies malicious/oversized/nested/formula/HTML/prototype-polluting input. | Offline isolated worker, bounds, schema validation, no execution/upload. | Parser/runtime bugs and resource exhaustion. | Corpus/fuzz rejects input with no network activity or content execution. |
| Export theft/tamper | Steals export or flips/truncates bytes. | Independent Argon2id export key, authenticated manifest, per-entry AEAD, bounds. | Weak export passphrase or compromised destination. | Cross-runtime restore; every bit mutation fails without partial output. |
| Coercion | Forces disclosure/unlock. | Honest product language; no hidden vault/plausible-deniability feature. | Not solved by Neutron. | UX/docs make no contrary claim. |
| Mail compromise | Reads SMTP/routing/stored-mail systems. | Separate mail DB/keys/authority, minimal logs, immediate stored-MIME encryption. | SMTP parties/router see content or routing before encryption. | Raw-mail/storage capture verifies encrypted persistence and no vault access path. |

## Claims and non-claims

The planned vault may claim that its service stores/transports authenticated
ciphertext rather than vault plaintext; that master-password unlock is local and
separate from passkey authentication; and that item type and human metadata are
encrypted. These claims apply to a release only after the specified protocol,
tests, and Stage 5 review.

Neutron must not claim protection from a malicious delivered client, compromised
unlocked device, traffic analysis, server-caused deletion/withholding,
fresh-client rollback, or non-comparing device forks. It does not provide
plausible deniability.

Ordinary mail is not zero knowledge. A future mail service may claim encrypted
storage after its documented plaintext window, never secrecy from SMTP parties
or the active router. Mail-plane compromise must not grant vault decryption or
mutation authority.
