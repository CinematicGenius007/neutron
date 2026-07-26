# System architecture

Status: Target architecture; interfaces finalized during Stage 0

## Component view

```text
Trusted client
  React/Vite PWA
    -> crypto worker
    -> encrypted IndexedDB cache
    -> client search index
    -> sync engine
    -> import/export worker
             |
             | TLS carrying ciphertext and signed operations
             v
Untrusted hosted service
  TypeScript Worker API
    -> WebAuthn public credentials and sessions
    -> D1 opaque operation/envelope records
    -> R2 encrypted blobs
```

Hosted and self-hosted adapters implement the same application ports:

```text
RecordStore       BlobStore       SessionStore       RateLimiter
    |                  |                |                  |
    +--- D1            +--- R2          +--- D1            +--- Worker
    +--- SQLite        +--- filesystem  +--- SQLite        +--- process
    +--- Postgres      +--- S3/MinIO    +--- Postgres      +--- Redis/later
```

## Proposed monorepo

```text
apps/
  web/                 static trusted client
  api/                 HTTP authentication and opaque storage application
  cli/                 future trusted client
  extension/           future signed browser client
packages/
  crypto/              versioned crypto API and providers
  protocol/            wire/storage schemas and canonical encodings
  sync-engine/         client mutation, verification, and reconciliation
  vault-domain/        plaintext client-only domain models
  import-export/       isolated parsers and `.neutron` format
  test-vectors/        language/runtime-neutral known answers
  ui/                  secret-safe UI primitives
infra/
  cloudflare/          Wrangler, D1, R2, DNS/security configuration
  self-hosted/         container and portable storage adapters
docs/
  decisions/           architecture decision records
  coordination/        durable multi-agent task state
```

## Dependency direction

```text
apps/web --------> vault-domain -----> protocol
   |                     |                |
   +----> sync-engine ---+                v
   |                                  crypto API
   +----> import-export -----------------+

apps/api --------> server use-cases ----> protocol
   |                                       |
   +----> infrastructure adapters          +-- never decrypts vault payloads
```

Infrastructure may depend inward on application ports. Domain, protocol, crypto,
and sync packages must never depend outward on Cloudflare, Node, React, or an ORM.

## Vault data flows

### Offline vault initialization

1. Client generates ARK, account signing key, first vault key, salts, and recovery
   material using the browser CSPRNG.
2. Client derives the master-password key using Argon2id.
3. Client creates independent password and recovery wrappers for the ARK.
4. User confirms the emergency kit before local initialization completes.

### Online account enrollment

1. Client creates a WebAuthn credential after the local vault exists.
2. Client prepares the recovery authentication public material defined by the
   Stage 0 authentication/recovery protocol.
3. Server receives WebAuthn public credentials, recovery public authentication
   material, wrapper envelopes, signed initial head, and ciphertext only.
4. Client verifies that returned identifiers and transcript bindings match the
   enrollment it initiated.

### Item creation

1. Client validates a plaintext item against a local schema.
2. Client creates a random item key and nonce.
3. Complete item payload is padded and AEAD encrypted.
4. Item key is wrapped by its vault key.
5. Client signs a mutation committing to prior head and ciphertext hash.
6. API validates authorization, sizes, versions, signature structure, concurrency,
   and quotas without seeing plaintext.

### Sync

1. Client authenticates using WebAuthn and receives a short server session.
2. Client requests opaque changes after its cursor/head.
3. Client verifies signatures, chain linkage, AEAD, and schemas locally.
4. Client reconciles revisions and writes only encrypted IndexedDB state.
5. Concurrent edits become explicit client-side conflict items.

### Password change

1. Unlocked client proves server authorization using WebAuthn/session.
2. Client derives a new password key with a new salt and current KDF profile.
3. Client re-wraps the existing ARK.
4. Server atomically replaces the wrapper using expected-version concurrency.
5. Vault/item ciphertext is unchanged.

## API shape

```text
POST /v1/auth/register/options
POST /v1/auth/register/verify
POST /v1/auth/login/options
POST /v1/auth/login/verify
POST /v1/auth/logout
POST /v1/auth/recovery/challenge
POST /v1/auth/recovery/verify

GET  /v1/account/envelopes
PUT  /v1/account/envelopes

GET  /v1/sync/head
GET  /v1/sync/changes?after=<cursor>
POST /v1/sync/commit
POST /v1/sync/ack

POST   /v1/blobs/initiate
PUT    /v1/blobs/:opaqueId
GET    /v1/blobs/:opaqueId
DELETE /v1/blobs/:opaqueId
```

All contracts require explicit version, maximum size, authentication context,
idempotency behavior, and error taxonomy. Error text must not echo secret input.

## Conceptual server records

| Record | Server-visible fields |
| --- | --- |
| Account | opaque ID, protocol version, creation/operational timestamps |
| Credential | opaque credential ID, WebAuthn public key, counter/flags |
| Session | random hashed session ID, account ID, expiry, authorization scope |
| Key envelope | account ID, purpose, version, KDF metadata, nonce, ciphertext |
| Vault object | opaque ID, owner, revision, padded ciphertext, wrapped key |
| Sync operation | cursor, prior head, ciphertext hash, signature, operation kind |
| Tombstone | opaque ID, signed deletion operation, retention deadline |
| Blob | opaque ID, padded size, content hash/ciphertext metadata, storage key |

Item type and human names are never server columns.

## Mail separation

Mail runs as a separate application and database boundary:

```text
Internet SMTP
  -> Cloudflare Email Service or Postfix/SimpleLogin
  -> routing/spam/policy processing (plaintext is visible here)
  -> immediate public-key encryption
  -> encrypted MIME in object storage
  -> opaque mailbox notification
```

Vault authentication may authorize the UI, but mail routing keys and operational
tables must not be placed inside the vault database. Compromise of the mail plane
must not grant vault decryption or mutation authority.
