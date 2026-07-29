# Architecture decision records

Accepted ADRs are binding until superseded by a newer accepted ADR.

| ADR | Status | Decision |
| --- | --- | --- |
| [0001](0001-client-and-api-stack.md) | Accepted | React/Vite PWA and portable TypeScript API |
| [0002](0002-authentication-and-unlock.md) | Accepted | Passkey authentication separated from master-password unlock |
| [0003](0003-crypto-core-direction.md) | Accepted | TypeScript crypto API with libsodium provider abstraction |
| [0004](0004-hosting-and-portability.md) | Accepted | Cloudflare-first hosted mode with self-host adapters |
| [0005](0005-mail-sequencing.md) | Accepted | Alias spike before mail; Cloudflare versus upstream SimpleLogin gate |
| [0006](0006-open-source-licensing.md) | Accepted | AGPL applications/server and permissive core packages |
| [0008](0008-web-delivery-policy.md) | Accepted | Dedicated vault worker and exact static web-delivery policy |
| [0010](0010-crypto-envelope-format.md) | Accepted | Canonical v1 encrypted envelope and key hierarchy |
| [0011](0011-offline-recovery-kit-format.md) | Accepted | Canonical offline recovery-kit format and confirmation |
| [0012](0012-password-generation-policy.md) | Accepted | CSPRNG-backed uniform password generation policy |
| [0013](0013-rfc6238-totp-computation.md) | Accepted | Worker-bound RFC 6238 TOTP computation policy |

Use [ADR_TEMPLATE.md](ADR_TEMPLATE.md) for a new decision. Do not edit the
rationale of an accepted ADR to make a later choice appear inevitable; supersede
it and link both records.
