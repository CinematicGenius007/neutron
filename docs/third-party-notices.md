# Third-party notices

This file records attribution obligations for third-party material redistributed
inside Neutron. It is a source-of-truth record, not a substitute for the release
governance owned by Task 0008, which must absorb or relocate it when open-source
governance is unblocked.

Third-party runtime *code* is governed separately by ADR 0006 and the lockfile.
This file covers non-code assets compiled into the application.

## EFF long passphrase wordlist

Used by the passphrase generator accepted in ADR 0014.

- **Creator:** Electronic Frontier Foundation
- **License:** CC-BY-4.0 (Creative Commons Attribution 4.0 International)
- **License text:** <https://creativecommons.org/licenses/by/4.0/>
- **Source:** <https://www.eff.org/files/2016/07/18/eff_large_wordlist.txt>
- **Retrieved:** 2026-08-01
- **SHA-256 of the retrieved bytes:**
  `addd35536511597a02fa0a9ff1e5284677b8883b83e986e43f15a3db996b903e`
- **Modified by Neutron: yes.** The dice indices were discarded and the
  remaining 7,776 words were re-joined with U+000A. No word was added, removed,
  altered, or reordered.
- **SHA-256 of the derived list** (7,776 words joined by U+000A, no trailing
  newline): `abae49761b88f3f1ba31ef944bea1f61b795a3cd7e1cfb7d276ed45bf77967ba`

The material is provided by its licensor as-is and without warranties or
conditions of any kind, express or implied, to the extent permitted by the
license linked above. Neutron makes no additional warranty about it.

Two facts are recorded plainly rather than glossed. First, EFF publishes no
checksum or signature for this file, so the digest above attests only that
Neutron's copy matches a single TLS retrieval on the recorded date; it is not a
verified upstream provenance chain. Second, EFF's copyright policy grants CC BY
4.0 over material *original* to EFF and notes that other material may require
permission from its copyright holder. The wordlist file carries no notice of
either kind, so this attribution rests on the list being EFF's own work, as
described in "Deep Dive: EFF's New Wordlists for Random Passphrases" (Joseph
Bonneau, 2016-07-19,
<https://www.eff.org/deeplinks/2016/07/new-wordlists-random-passphrases>). This
is a documented reading, not legal advice and not an explicit written grant.

When Task 0023 is implemented, the same attribution must be exported as a string
constant from the wordlist module and rendered in the application's generator
surface. The production build strips comments — including `@license` banners —
from emitted JavaScript, so a source-file header alone would not survive
redistribution.
