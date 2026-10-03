# Guarded AAC span delivery — 2026-10-03

This is a reviewable isolated source candidate based on the verified 282-path
root snapshot, SHA-256
`dcf385d2cdb14d0ed03b0a720d48f711c18287c5ce019e2dfdee1fb6c18fb194`,
at `c8fccc4f6e32459768043961963324331c52925c`. No root production source, Git
commit, push, CI dispatch or deployed Worker was changed. M19 remains open.

## Behavior and bounded correction

Chromium's native decoder preserves submitted AAC input timestamp deltas but
emits continuous PCM across the named one-second input gap. The existing SDK
restores only the first timestamp. The correction remains inside its existing
audio wrapper and AAC configuration parser. Codec-derived coded spans preserve
the original packet presentation clock, consume actual decoded frame counts and
split an output with existing `AudioSample.trim` only at a discontinuity.
Contiguous spans merge. Native decoding stays continuous; packet duration,
callback identity, platform delay constants and per-packet flush are not used.

The matching preferred TypeScript and generated ESM add 86 emitted runtime lines:
24 in codec metadata and 62 in the wrapper, replacing six wrapper lines. Typed
source exposed the prototype's use of private `Bitstream.readBit`; the final
source uses the public equivalent `readBits(1)`. General metadata parsing keeps
existing unsupported-core behavior; requesting unknown span provenance explicitly
throws. Surplus PCM, unexpected rate or unexplained discard at successful drain
also reject. Cancellation closes without requiring a complete drain. PCM,
non-AAC/custom decoding, capability queries and existing decoder lifecycle/pump
remain intact. No new dependency or decoder implementation was introduced.

LC 1024/960 and explicit HE metadata fixtures are finite parser evidence. Physical
codec proof is limited to the named LC 44.1/48 kHz fixtures. Native HE/960,
implicit SBR, in-band priming, ADTS without ASC and coarse container clocks remain
unproven. No general AAC compatibility claim is made.

## Exact offline source and whole-state guard

Mediabunny remains exactly 1.55.6, with its original npm tarball URL, integrity,
installed manifest and browser/Worker/Node ESM entries pinned. Official registry
gitHead is `6319bf2eee41c1143c3de02d35347cf31d6de53e`. All five transitive shared
preferred TS modules and original root/src/shared configs were fetched once from
that official commit, with each Git blob verified. The checked-in seed at
`docs/licenses/mediabunny-1.55.6-sdk-patch.json` contains their source and exact
original/legacy/corrected artifacts; CI/install/build needs no source fetch.

Installed TypeScript 6.0.3 with the upstream ES2021/ESNext target reproduces both
original parser and wrapper ESM files byte for byte. Original AAC declarations
and maps also reproduce after the published relative-import extension rewrite.
The final guard covers seven artifacts, not merely four implementation files:

1. `src/media-sink.ts`
2. `dist/modules/src/media-sink.js`
3. `shared/aac-misc.ts` (known absent from pristine npm package)
4. `dist/modules/shared/aac-misc.js`
5. `dist/modules/shared/aac-misc.d.ts`
6. `dist/modules/shared/aac-misc.d.ts.map`
7. `dist/modules/src/media-sink.d.ts.map`

Every original/legacy/corrected SHA-256 is in the seed and handoff manifest.
Preflight validates the pin, manifest, entries, seed and entire artifact set
before its first write. Only complete pristine, complete prior clock correction
and complete new states are accepted. Any mixed/unknown/missing applied artifact
rejects without modifying any source. Source symlinks reject. The manually
patched prototype state was explicitly rejected with zero writes before moving
the owned install to the complete prior state and applying the guarded candidate.

Source changes invalidate optimized SDK caches. Idempotent guards discard an old
clock-only graph and preserve a verified span graph. The actual warm Vite graph's
twelve files remained byte-identical across a final guard invocation.

## Source-offer completeness and honest type boundary

The earlier seventy-entry offer omitted upstream shared preferred modules. The
corrected eighty-three-entry MPL archive includes all transitive shared source,
matching modified TS/ESM/declarations/maps, original configurations, README,
package metadata, license, guard recipe and offline source seed. Every artifact
and unmodified shared source hash was checked inside the ZIP. Two successive
builds produced identical SHA-256
`38c368991835d0f237e77cd1fd21c6c6713e75a02c895750b8de98c7d5b41cfa`.

The upstream complete preferred source reports four existing TS6/Node24
`AsyncGenerator[Symbol.asyncDispose]` errors in unchanged pumps/misc. Stock and
patched file/code/message diagnostics match exactly; none was suppressed or
fixed through unrelated runtime edits. Parser/shared strict checks pass. The
source seed records the original build configuration, compiler provenance and
these diagnostics. This receipt does not claim the standalone full upstream
source compiler passed. Lumafoil's full `npm run typecheck` with patched
declarations does pass.

## Executed proof

- `npm run test:vendor`: 34/34, including complete pristine/prior/new states,
  each artifact's mixed/unknown/missing applied state, pin/entry/manifest/seed
  changes, source symlinks and cold/warm cache controls. Zero skips.
- Fresh independent `npm ci`: exit zero, 788 packages; normal postinstall
  reconstructed all seven exact artifacts from pristine bytes. Existing seven
  high development-tool advisories remain unwaived.
- Full project `npm run typecheck`: exit zero after cold delivery; scoped lint
  and format pass. Initial six routine observer/fixture lint issues were fixed
  without rule changes, then the remaining nested ternary was replaced with
  explicit branches.
- Original `npm run test:codecs`: 18/18, exit zero, 5.22 seconds, no skips. This
  retains exact export duration, waveform, calibrated priming, coded extent and
  native forwarding-failure assertions.
- Canonical AAC browser test in Chromium and WebKit: 20/20, exit zero, 3.39
  seconds, no skips. Mono 44.1 kHz, stereo 48 kHz and gap imports run in page and
  Worker, with native cancel/error cleanup. Original first-timestamp/delta/gap,
  active-tone/natural-rest and lifecycle assertions remain unchanged. Added
  inserted-gap silence with nongap active negative, post/final tone and raw native
  versus SDK frame conservation. Every original 30,000 ms deadline remains.

The earlier finite numeric prototype evidence is retained separately:
`aac-span-prototype-2026-10-03.{md,json}` and capture SHA-256
`fdbc0344e47b8720701cf3232839c516c66d63b60c1b3767d25fb8a27b0af776`.
Canonical final tests use the guarded generated artifacts instead of the manual
prototype bytes. Full quality/E2E/SAST/visual certification is not asserted by
these isolated gates; the full dependency audit still has its known blocker.

## Next slice

Review and apply the exact source/test/offer handoff while preserving root's newer
cleanup/storage/financial changes and documents. Root PLAN/CHANGELOG proposals
remain separate from the source patch. Then verify combined source and required
global gates. No unchanged known audit retry, deployment or M19 completion is
authorized by this isolated receipt.

## Integrated publication correction

The first root build met every bundle budget (application shell 139.2/140 kB
gzip), but strict publication rejected five generated dist paths in the isolated
83-entry source offer. The producer now archives all preferred source and the
verified offline seed, which already contains exact compiled/declaration/map
bytes at recorded installed paths. It removes the five redundant generated
entries rather than exempting them. The current complete offer has 78 entries;
all preferred modules and all seven reconstructed installed artifacts match.

The strengthened existing built-license test rejected the stale 83-entry output
with the single expected failure (41 other built tests passed; zero skips).
Corrected full build/publication remains pending at this checkpoint. The earlier
isolated hash/count above remains historical; current integrated hash/count is
recorded separately in the JSON receipt. No runtime seed/artifact or publication
policy changed.
