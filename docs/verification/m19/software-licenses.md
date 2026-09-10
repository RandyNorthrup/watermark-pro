# Bundled software license delivery

Updated 2026-09-09. Fresh builds passed 37 artifact checks, including the actual
bundled notices and corresponding-source archive. Final release checks remain
bound to the final source and build, not this intermediate artifact.

Creative asset rights and application dependency rights are separate. Font and
sticker notices already accompany their local assets and applicable exports.
The compiled application also needs its bundled dependency notices: minification
does not consistently retain every upstream license comment.

The canonical Vite build now uses its native `build.license` facility to emit
`third-party-licenses.md` from the actual bundled dependency graph. Every built
JavaScript chunk references that file and the source offer through a short
comment. This uses installed tooling, with no additional dependency or fabricated
package inventory. See [Vite's build license option](https://vite.dev/config/build-options#build-license).

The native inventory contained 134 dependency entries, but two npm packages
omitted their full license text: `qrcode-generator` 2.0.4 and
`react-remove-scroll-bar` 2.3.8. Reviewed upstream MIT files are stored under
`public/software-licenses/`, with pinned source commits and SHA-256 digests in
its manifest. The QR notice comes from its release commit. The scroll-bar
package's published Git commit is unavailable upstream; its package and README
declare MIT, and the notice comes from the repository's later explicit LICENSE
addition. That distinction is retained in the manifest rather than presented as
an exact release-commit recovery.

`scripts/lib/software-notices.ts` checks installed versions and reviewed file
digests, then fills only empty native license entries before the offline asset
inventory hashes the final document. It rejects missing or duplicate expected
entries and changed versions/notices. Independent built checks require every
actual dependency entry to have full text; the current artifact has no empty
entries. These notices apply to bundled software, not users' input content.

The video tools bundle Mediabunny 1.55.6 under MPL-2.0. Before building,
`scripts/build-open-source.mjs` verifies the installed version against the exact
project pin and packages its original `src` files, README, package metadata and
license. The 69-file, 470,420-byte archive is available through the explicit
offer in `public/open-source.md`. ZIP timestamps are fixed for reproducibility;
symbolic links are refused. A dependency upgrade must update the offer too.

Mozilla describes the source-availability and recipient-notice requirements in
its [MPL FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/) and
[license text](https://www.mozilla.org/en-US/MPL/2.0/). The source archive makes
the corresponding source available directly with the app. This does not change
the license of users' photos or other input content.

The post-build verification checks actual React and Mediabunny notices, the
matching source-offer link, and independently decompresses the archive to compare
the license and source entry with the installed package. The publication scanner
also validates every archive entry and compares private values against source
and release candidates. The bounded-bootstrap artifact audit passed 2,388
candidate/object checks and 114 archive entries, including the brand and
media-source archives. These counts describe that artifact only; the final build
must run the same checks again.

The notice and source-offer documents are included in the offline inventory.
The full source archive is an on-demand download, keeping installation focused
on the resources needed to use the app offline.
