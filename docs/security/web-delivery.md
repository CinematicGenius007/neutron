# Web delivery security policy

This document is normative for production vault builds. `MUST`, `MUST NOT`,
`SHOULD`, and `MAY` have their RFC 2119 meanings.

## Security boundary and residual risk

The browser origin, shipped JavaScript, build dependencies, service worker, vault
worker, browser, and operating system are in the trusted computing base. Encryption
at rest does not make a hostile delivery origin harmless: code served by that
origin can wait for unlock, request plaintext through authorized UI paths, alter
the recovery ceremony, or weaken this policy on its next response. CSP, Trusted
Types, worker isolation, reproducible builds, and review reduce mistakes and make
changes auditable; they do not solve malicious-origin risk.

The application MUST make this limitation visible in security documentation and
release notes. It MUST NOT describe the web client as safe after its origin or
runtime JavaScript is compromised.

## Supported browsers

Core vault use means enrollment, kit confirmation, unlock, lock, all item CRUD,
offline reload, update activation, and corruption isolation. Releases MUST test:

- the current and previous stable Chromium engines on desktop plus Android;
- current stable Firefox and Firefox ESR on desktop plus an Android smoke test;
- the current and previous major Safari releases on macOS, iOS, and iPadOS; and
- installability on platforms that expose PWA installation, without treating
  installation as a requirement for core browser use.

The matrix is reassessed quarterly. The automated minimum is the pinned Playwright
Chromium, Firefox, and WebKit versions in the lockfile. A release checklist records
the actual engine versions and at least one real Safari/iOS smoke test. Each
release publishes the exact browser versions whose enforcement tests passed.
Before password entry, the app feature-detects concrete APIs including module
workers, WebAssembly, IndexedDB, Web Crypto, service workers, and required text
encoders, and shows an unsupported-browser screen when one is absent. Browsers
expose no reliable API that proves every CSP directive is enforced, so CSP support
is established by the release matrix and deployed-response tests, not runtime
inference. Trusted Types remains defense in depth where the tested browser
implements it.

Support follows the moving matrix above, not a permanent version promise.
Dropping a version requires a release-note entry and must never trigger storage
deletion.

## Normative response policy

Production is HTTPS-only. The canonical custom domain MUST send these headers on
the app shell, fallback document, service worker, manifest, modules, styles, and
worker scripts unless a stricter path rule is stated:

```http
Content-Security-Policy: default-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'; script-src 'self' 'wasm-unsafe-eval'; script-src-attr 'none'; style-src 'self'; style-src-attr 'none'; img-src 'self'; font-src 'none'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; child-src 'none'; frame-src 'none'; media-src 'none'; require-trusted-types-for 'script'; trusted-types neutron-static-script-url; upgrade-insecure-requests
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
Origin-Agent-Cluster: ?1
Referrer-Policy: no-referrer
Permissions-Policy: accelerometer=(), ambient-light-sensor=(), autoplay=(), browsing-topics=(), camera=(), clipboard-write=(self), display-capture=(), document-domain=(), encrypted-media=(), fullscreen=(), geolocation=(), gyroscope=(), hid=(), identity-credentials-get=(), interest-cohort=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-create=(self), publickey-credentials-get=(self), screen-wake-lock=(), serial=(), storage-access=(), usb=(), web-share=(), xr-spatial-tracking=()
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-Permitted-Cross-Domain-Policies: none
Strict-Transport-Security: max-age=63072000; includeSubDomains
```

The two `publickey-credentials-*` directives reserve same-origin passkeys for
Stage 3. Unknown Permissions Policy directives are ignored by browsers, so tests
must verify known high-risk features instead of treating header length as proof.
`wasm-unsafe-eval` permits WebAssembly compilation needed by the crypto provider
without permitting JavaScript string compilation. `connect-src 'self'` permits
same-origin connections at the CSP layer; Stage 2 application code uses it only
for the generated static WASM fetch, enforced by an exact browser-test request
allowlist. A successor ADR must authorize any API path.
`unsafe-inline`, `unsafe-eval`, `trusted-types-eval`, wildcard sources,
scheme-wide script sources, and CSP nonces baked into static output are forbidden.
The UI uses external hashed CSS and class names, not inline style attributes.

The sole Trusted Types policy, `neutron-static-script-url`, may create only a
`TrustedScriptURL` for the compile-time exact hashed vault-worker URL and the
literal `/service-worker.js`. It rejects other origins, query strings, fragments,
and arbitrary input paths. It cannot observe or reject an HTTP redirect, so
deployed-response tests separately require both URLs to return `200` directly at
the expected final URL with the expected media type and bytes. The policy cannot
create HTML or Script values and is not a default policy. This narrow policy is
needed because service-worker registration and worker construction are injection
sinks under Trusted Types enforcement.

The production domain may add HSTS `preload` only after every covered subdomain is
verified HTTPS-only and the owner accepts the browser preload program's long-lived
rollback cost. Self-hosters that cannot safely cover every subdomain MUST omit
`includeSubDomains` rather than publish a false policy.

Documents and `/service-worker.js` MUST use `Cache-Control: no-cache,
max-age=0, must-revalidate`. The web manifest and deterministic build descriptor
use the same policy. Content-hashed JS, CSS, fonts, icons, and worker chunks use
`Cache-Control: public, max-age=31536000, immutable`. Executable resources MUST
have correct JavaScript or CSS media types and `nosniff`.

Cloudflare Pages implements static response headers through a checked-in
`public/_headers`. Pages Functions do not inherit `_headers`, so introducing a
Function or SSR path requires explicit equivalent response code and a new review.
Cloudflare Web Analytics, Zaraz, Rocket Loader, browser insights scripts, and
automatic third-party injections MUST remain disabled because they expand both
CSP and the runtime trust base. Pages currently adds
`Access-Control-Allow-Origin: *` to static responses; the vault `_headers` file
MUST explicitly detach it and deployed-response tests MUST confirm its absence.

Required media types are `text/html; charset=utf-8` for HTML,
`text/javascript; charset=utf-8` for modules and service workers,
`text/css; charset=utf-8` for CSS, `application/manifest+json` for the manifest,
`application/json; charset=utf-8` for JSON, `application/wasm` for WASM, and
`image/svg+xml` for SVG. Tests deliberately mis-serve executable resources and
require `nosniff` to block them.

## Runtime resource and network rules

Production HTML, CSS, manifests, and JavaScript MUST reference only same-origin,
content-addressed release assets. No remote fonts, icons, images, scripts,
iframes, source maps, analytics, error collectors, chat widgets, tag managers,
advertising, CDN modules, or runtime package loaders are allowed. Blob and data
URLs are not production resource channels. A future attachment viewer requires a
separate CSP and lifetime decision.

Stage 2 application code MUST perform no network fetch after its static build is
installed. Browser tests fail on any request outside the navigation, exact static
asset allowlist, and explicit service-worker update check. Secrets and item fields
MUST NOT enter URLs, document titles, referrers, notifications, logs, crash
reports, DOM attributes used as identifiers, or performance marks.

Source maps MAY be produced as separate release artifacts for maintainers but
MUST NOT be deployed to the public vault origin. Build output MUST contain no
environment values other than reviewed public configuration.

## Window, vault worker, and service worker

The vault worker owns unlocked session keys, envelope operations, and IndexedDB
access. The window receives only validated metadata and the minimum item plaintext
needed for the active view. It never receives the ARK, vault keys, item keys,
password bytes, recovery secret bytes, or generic decrypt/encrypt primitives.

Every window-to-vault-worker message is a closed, versioned discriminated union:

```text
{ protocol: 1, requestId: uint64 decimal string, sessionEpoch: uint64 decimal string,
  operation: fixed enum, input: operation-specific bounded object }
```

Every response echoes `protocol`, `requestId`, and `sessionEpoch` and contains
exactly one of a bounded success result or a stable error code. Before calling
`postMessage`, each sender validates its original value's own enumerable data
properties, exact fields, accessors, prototype, scalar/string/collection limits,
and transferable set. That preflight prevents accidental getter execution and
authority hidden in inherited properties, but a receiver cannot prove it occurred:
the structured-clone algorithm reads values and normalizes ordinary prototypes.
Each receiver therefore independently validates the cloned value's exact schema,
bounds, discriminant, request/session identity, and allowed cloned types. Unknown
operations, duplicate or in-flight IDs, stale epochs, shared memory, oversized
values, and malformed transfers fail closed.

Only owned `ArrayBuffer` values are transferred and detached; strings and ordinary
objects are cloned because they are not transferable. Transfer is an ownership
tool, not secure erasure. The DOM/window necessarily holds the password and
recovery-kit strings before sending them and holds item strings while rendering;
the product does not claim those immutable strings can be cleared from memory.
Lock increments the epoch, clears owned keys, rejects queued work, and causes late
results to be discarded; after its lock acknowledgement the window terminates
that worker and creates a fresh one for the next unlock. A compromised window can
still ask an unlocked worker for authorized plaintext; worker isolation is
key-containment, not a substitute for origin integrity.

The worker exposes named ceremonies and bounded use cases such as enrollment,
unlock, lock, paged item summaries, point item reads, and conflict-bound writes.
It exposes no generic encrypt, decrypt, derive, random, key import/export, or raw
record operation. Password and recovery input is accepted only by its ceremony
and is never echoed. Until the encrypted local-index format exists, a list request
returns a bounded page of validated display summaries rather than every complete
item in the vault; point reads return one requested item.

The service worker MUST NOT import vault, crypto, vault-storage, item, recovery,
or sync packages. Its complete message union contains only `query-build`,
`update-state`, `begin-update`, `prepare-lock`, `lock-ack`, `activation-permit`,
`activate-build`, `abort-update`, `recover-update`, and `locked-boot-ack`; each operation has an
exact direction, phase, nonce/build tuple, and bounded schema. The directions are
closed: a window sends `query-build`, `begin-update`, or user-confirmed
`recover-update` to the active worker; the
active worker answers `update-state`, broadcasts `prepare-lock` or pre-permit
`abort-update`, and accepts `lock-ack`; after stable quiescence it sends
`activation-permit` to the initiator; the initiator forwards that unchanged as
`activate-build` to `registration.waiting`; and reloaded windows send
`locked-boot-ack` only to the new active worker. The waiting worker accepts a
permit only when its nonce/build tuple and persisted `permitted` record match
exactly. No other sender/direction pair is valid.

It caches only an exact generated allowlist of same-origin GET responses whose
hashes belong to one build. It MUST NOT cache API
responses, POST bodies, IndexedDB data, decrypted values, recovery content,
opaque responses, redirects, or arbitrary runtime URLs. Cache names are prefixed
with the application and build identity. Installation writes a final-build-named
cache while delivery state marks it `staging`; “promotion” is only an atomic
delivery-state transition and never a Cache Storage rename or copy. Activation
marks it active, retains the immediately prior complete cache, and deletes
earlier application-prefixed caches only after the locked-boot acknowledgement
defined below.

## Storage and plaintext lifetime

The vault IndexedDB contains only validated encrypted envelopes and public tuple
identity keys described by the protocol. A separate service-worker-owned
`neutron-delivery-state-v1` IndexedDB contains zero or one bounded public update
barrier record and never imports or opens the vault database. Cache Storage
contains only release assets.
Local Storage, Session Storage, cookies, OPFS, URL state, and service-worker
messages contain no vault plaintext, password, recovery secret, or raw key.

Plaintext necessarily exists in JavaScript strings and browser-managed memory
while rendered. Clearing byte arrays and locking is best effort; garbage
collection, browser swap, extensions, accessibility tools, screenshots, and a
compromised renderer are outside the erasure guarantee. Clipboard writes require
an explicit user gesture, show a warning, attempt a short bounded clear, and never
claim that clipboard history or another device is cleared.

## Install, update, and rollback

The service worker has the stable URL `/service-worker.js`, is registered as a
module with `scope: "/"` and `updateViaCache: "none"`, and is never renamed per release. Each
build has an immutable cache and an exact asset manifest. Installation fetches
and validates the complete new allowlist before the worker can wait; a failed
install leaves the current worker and cache active.

The install handler MUST NOT call `skipWaiting()`. A waiting build produces a
visible update prompt containing its short build identity. Activation requires a
user action followed by a two-phase, all-client quiescence protocol coordinated
by the active service worker:

1. The initiator asks the active worker to create a random update nonce bound to
   the exact current and waiting build IDs. Before broadcasting, the active worker
   atomically writes the delivery-state record in phase `preparing`. It then enters
   an update barrier within one `ExtendableMessageEvent.waitUntil()` lifetime,
   causes clients to reject new unlocks and operations, uses
   `clients.matchAll({type:"window",
   includeUncontrolled:true})` to enumerate every same-scope window client, and
   sends each a `prepare-lock` message containing that tuple. While the barrier
   exists, navigation fetches receive only a cached locked update screen, never a
   bootable old vault shell.
2. Every client blocks new vault operations, locks and terminates its vault
   worker, clears rendered plaintext and clipboard timer state, and acknowledges
   the nonce plus its last session epoch. Already locked clients still acknowledge.
3. The active worker re-enumerates clients until one stable snapshot has a valid
   acknowledgement from every live client. A newly opened client sees the barrier
   during boot and cannot create a vault worker or unlock before acknowledging.
   A timeout, invalid response, failed lock, changed target, or unsupported client
   aborts activation and leaves the old worker active. An abort is allowed only in
   `preparing`, is persisted before clients are released, and invalidates the nonce.
   Activation MAY instead wait until the registration has zero clients.
4. Only after the active worker issues a nonce-bound permit may the exact waiting
   worker call `skipWaiting()`. Before sending that permit, the active worker
   atomically records phase `permitted` plus the stable acknowledged-client set.
   A permitted transition cannot time out back to an unlocked old build; it must
   complete activation or remain safely update-locked for explicit recovery. The
   new worker's activate handler uses one IndexedDB transaction to change phase
   from `permitted` to `awaiting-boot` and set the active/previous cache pointers.
   That transaction is the logical promotion of the already populated cache; no
   rename or copy occurs. It then calls `clients.claim()`. Every quiescent client reloads on
   `controllerchange` before accepting any vault operation. A client that cannot
   reload stays locked behind the update barrier.
5. Each reloaded client reports a locked-screen boot acknowledgement for the new
   build. After every then-live client acknowledges (or has closed), the new active
   worker clears the barrier and deletes all application caches except the new
   cache and the immediately prior complete cache. The next successful update may
   delete that retained prior cache.

Nonce, build, client, epoch, timeout, and state-transition fields are exact,
versioned, bounded service-worker messages. No page may mix old UI chunks with a
new controller or activate an update from a single-tab acknowledgement.

The delivery-state phase is exactly `staging`, `preparing`, `permitted`, or
`awaiting-boot`, with phase-discriminated required fields. The exact plain record
contains schema version, phase, 32-byte nonce encoded as 64 lowercase hex
characters once preparation begins, current/target build
IDs, active/previous cache build IDs, deadline, and at most 64 unique
client-ID/epoch/ack tuples. It contains no
vault identifier or secret. Every old-worker navigation fetch and every old-shell
boot reads this record before serving or enabling the vault; `preparing`,
`permitted`, and `awaiting-boot` all produce only the locked update screen. A
restarted worker resumes `preparing` or leaves the persisted barrier for an
explicit pre-permit abort ceremony, and always preserves `permitted` or
`awaiting-boot`; loss of the JavaScript global therefore cannot erase a permit
or reopen an unlock race. Only a persisted pre-permit abort, the proven-redundant
target recovery below, or completion of the new-build all-client locked-boot
phase clears the record.

The promotion transaction is atomic, so a crash leaves either `permitted` with
the old cache pointers or `awaiting-boot` with the new pointers, never an
intermediate combination. A restarted target worker advances a matching persisted
`permitted` record through that same transaction before serving any shell. A
worker whose build tuple does not match leaves the barrier locked and reports
recovery-required; it never guesses or clears the state.

Recovery from `permitted` is an explicit user gesture and an exact state machine,
not a timeout. If the registration's active worker is the target, it advances to
`awaiting-boot`. If the active worker is still the recorded source and the target
worker is absent or terminally `redundant` with no matching installing/waiting
worker, it atomically records a pre-activation abort, invalidates the nonce,
broadcasts the locked abort state, and then clears the barrier. Any other worker
combination remains recovery-required and locked for operator diagnosis. A later
downloaded worker must begin with a new nonce and cannot consume the invalidated
permit.

The app checks `registration.update()` at startup, after returning online, and at
most once per hour while open. It shows current and waiting build identities in
settings and on the locked screen. A security-critical release may block new
unlock attempts until update, but it still MUST NOT hot-swap an unlocked client.

Operator rollback selects a previously reviewed production artifact or rebuilds
the corrective commit and follows the same waiting/lock/reload flow. Republishing
an exact prior artifact preserves its original deterministic build identity; a
corrective commit has a new identity. Clients never silently restore or splice an
older cache.
Before rollback, operators verify envelope, IndexedDB, and worker-message backward
compatibility; incompatible rollback requires a forward fix.

## Build identity and reproducible release

Release metadata uses RFC 8785 JSON Canonicalization Scheme encoded as UTF-8
without a BOM or trailing newline. Asset paths use `/` separators, begin with one
`/`, are Unicode NFC, contain no empty, `.` or `..` segment, query, fragment, NUL,
backslash, or percent-encoded separator. Duplicate paths are rejected after NFC
normalization, then entries are sorted by unsigned UTF-8 path-byte order before
canonicalization. Byte lengths are nonnegative safe integers and SHA-256 values
are exactly 64 lowercase hexadecimal characters. Git identity is the full
lowercase object ID from `git rev-parse HEAD` plus an explicit `sha1` or `sha256`
object-format field; it is never abbreviated.

Generation is staged to avoid a hash cycle while binding every executable byte:

1. Vite emits HTML, hashed JS/CSS/WASM, the hashed vault worker, icons, and the web
   manifest. CI creates canonical `asset-manifest.json` with exactly this closed
   shape (shown pretty only for readability):

   ```json
   {
     "schemaVersion": 1,
     "assets": [
       { "path": "/assets/app.example.js", "byteLength": 123, "sha256": "<64 lowercase hex>" }
     ]
   }
   ```

   The root has exactly `schemaVersion` and `assets`; every asset has exactly
   `path`, `byteLength`, and `sha256`; the array is nonempty and already in the
   canonical path order; duplicate paths and unknown fields reject the build.
   The manifest covers all emitted files; only `asset-manifest.json`,
   `/build.json`, and `/service-worker.js` are excluded from it.
2. CI computes `assetManifestSha256`, then generates `/service-worker.js` from the
   exact canonical asset list and digest. The service-worker source contains that
   digest but not the final build ID. CI then computes `serviceWorkerSha256` over
   its final bytes.
3. CI computes the build ID as SHA-256 over canonical
   `{schemaVersion:1, source:{algorithm,oid}, assetManifestSha256,
   serviceWorkerSha256, packageVersion, protocolVersions, storageVersions}`.
   Those fields are a closed schema: versions are exact nonempty ASCII strings or
   sorted unique arrays of them, not free-form objects. Thus executable or
   compatibility-metadata changes both change the build ID.
4. CI generates `/build.json`; the service worker fetches it during install,
   validates its schema and compiled asset-manifest digest, directly fetches its
   own stable URL with cache bypass, requires a nonredirected `200` response, and
   compares those bytes with the declared service-worker digest before using the
   build ID for the staged cache. The release gate independently repeats that
   comparison against deployed bytes.

`build.json` contains only schema version, full Git identity, package version,
protocol/storage versions, asset-manifest digest, service-worker digest, and the
derived full build ID.

Timestamps, host paths, usernames, random nonces, deployment IDs, branch names,
and secrets are excluded. The short UI identity is the first 12 lowercase hex
characters of the build ID; security reports use the full build ID,
asset-manifest digest, and Git commit.

Release CI uses the repository-pinned Node and pnpm versions, a frozen lockfile,
a clean source archive, locked locale/timezone, documented `SOURCE_DATE_EPOCH`,
an explicit Vite build target derived from the browser matrix, and no unreviewed
network step after dependency acquisition. It builds twice in separate clean
directories and compares every output path and SHA-256 digest. A mismatch blocks
release. CI also publishes an SPDX or CycloneDX SBOM, dependency-license report,
source commit, canonical asset manifest, and artifact digest. Deployment uploads
the already verified artifact; the hosting provider does not rebuild it.

Preview deployments use synthetic data only, send `X-Robots-Tag: noindex`, and
MUST NOT receive production deploy tokens, user vaults, or trusted release status.
Untrusted pull requests cannot access signing or deployment credentials.

## Automated release gates

A production candidate fails unless automation proves:

1. every document and executable response has the exact required headers and
   cache policy, including SPA fallbacks and error routes;
2. CSP contains no forbidden source and blocks inline/eval/remote execution;
3. Trusted Types enforcement is active where implemented and the app creates
   exactly the one narrow `neutron-static-script-url` policy;
4. all runtime requests match the generated same-origin asset allowlist;
5. Cache Storage and IndexedDB raw scans contain no synthetic plaintext sentinel;
6. service-worker install failure preserves the old build, all-client quiescence
   aborts on missing acknowledgement, controller change reloads every locked
   client, service-worker restart cannot erase a permitted barrier, and cache
   retention/cleanup follows the two-build rule;
7. sender preflight rejects inherited/accessor authority and both receivers reject
   malformed, stale, oversized, duplicate, and unknown cloned messages without
   returning plaintext;
8. Chromium, Firefox, WebKit, offline reload, and real Safari/iOS smoke gates pass;
9. two clean builds are byte-identical, independently derive the same RFC 8785
   build ID, bind every executable plus compatibility metadata, and match the
   published manifest/SBOM; and
10. a documented host rollback drill and a no-hosting-account offline restore
    drill have succeeded for the release line.

## Primary references

- [Content Security Policy Level 3](https://www.w3.org/TR/CSP/)
- [Trusted Types working draft](https://www.w3.org/TR/trusted-types/)
- [MDN CSP guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP)
- [MDN Cross-Origin-Embedder-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy)
- [MDN service-worker registration and `updateViaCache`](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register)
- [Service worker lifecycle](https://web.dev/articles/service-worker-lifecycle)
- [Cloudflare Pages custom headers](https://developers.cloudflare.com/pages/configuration/headers/)
- [Cloudflare Pages serving and cache behavior](https://developers.cloudflare.com/pages/configuration/serving-pages/)
- [Cloudflare Pages rollbacks](https://developers.cloudflare.com/pages/configuration/rollbacks/)
- [Vite build manifest](https://vite.dev/config/build-options#build-manifest)
- [RFC 8785 JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785)
