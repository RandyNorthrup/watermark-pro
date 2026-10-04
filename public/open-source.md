# Lumafoil open-source notices

Lumafoil's application source is available under MIT at
https://github.com/RandyNorthrup/watermark-pro.

The build's complete bundled dependency license inventory is available at
[/third-party-licenses.md](/third-party-licenses.md). Libraries retain their own
copyright and license terms; the application's MIT license does not replace them.

## Mediabunny source offer

The video tools include Mediabunny **1.55.6**, licensed under the
Mozilla Public License 2.0, with Lumafoil's native AAC clock and presentation-span
correction. Negative native input timestamps are shifted forward, and decoded
PCM uses codec-derived spans to retain packet presentation gaps. The library's
corresponding modified TypeScript implementation, matching emitted implementation/
declarations/maps, every transitive shared preferred module, original build
configuration, README, package metadata and license are provided without charge in
[mediabunny-1.55.6-source.zip](/open-source/mediabunny-1.55.6-source.zip).
The archive includes `LUMAFOIL-PATCH.mjs` and the versioned offline source seed,
documenting exact original/legacy/corrected artifact hashes, registry gitHead,
compiler provenance and guarded installation. Matching emitted implementation,
declaration and map bytes are embedded in that seed and can be reconstructed at
their recorded installed paths. The archive itself contains preferred source,
without generated `dist` directories. The earlier archive omitted the
upstream shared modules; this offer corrects that omission. Native proof is
limited to the named LC fixtures; it does not certify every AAC profile, priming
variant or container clock.

The upstream project is https://github.com/Vanilagy/mediabunny. The included MPL
license and source notices remain applicable to that library. Bundling it does
not change the license of users' photos, videos, documents or watermarks.

## Creative assets

Bundled font provenance and notice paths are listed in the
[font manifest](/fonts/manifest.json). Sticker provenance is in the
[sticker manifest](/stickers/manifest.json), with the
[Fluent MIT notice](/stickers/LICENSE.txt). The brand kit
retains its Inter and UI-kit notices. Exports containing licensed artwork retain
the required notices as documented in Lumafoil's asset licensing guidance.
