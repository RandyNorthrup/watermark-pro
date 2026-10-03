# Encoded-image upload boundary — 2026-10-03

This isolated candidate derives stored image dimensions from encoded fields,
honors genuine JPEG display orientation and refuses contradictory client claims.
It preserves the existing authentication, permission, account, folder, preset,
quota, idempotency and private-object lifecycle. It is not release certification.

## Provenance and limits

The checkout `codex/encoded-image-validation` starts at
`c8fccc4f6e32459768043961963324331c52925c`. All 236 regular files and modes from
`/tmp/lumafoil-security-seed-2026-10-03/manifest.json` were verified before copying;
manifest SHA-256 is
`07e9453bc40f5982f16d1c5e7e83101aa352bf68564f4e2bce80384d57c29c1d`.
No credentials or node_modules were copied. Independent `npm ci` passed, then the
exact reviewed `image-dimensions` 2.6.0 was installed after PLAN §3.1 recorded its
release age, peers, engines, registry integrity and advisory evidence. Existing
seven-high development-tool findings remain unwaived.

Stored photos, logos and thumbnails continue to admit PNG/JPEG/WebP. Generic
GIF/AVIF URL imports retain their own existing behavior. The approved limits are
photo and logo sides at most 8,192 pixels; thumbnail longest side at most 400.
The existing 40/5/1 MiB byte caps are unchanged. The thumbnail tunable moved from
the client module into shared constants without changing first-party generation.

The dimension reader probes immutable File prefixes geometrically before full
body buffering. Normal headers do not cause a copy of the entire pixel payload
inside the dependency. There is no new smaller header admission cap. Large or
malformed late headers can still require large prefixes; their memory/CPU risk
remains a measured-review obligation below. Encoded dimensions come from the
primary raster fields, never EXIF dimension tags. JPEG orientation uses exifr's
existing supported ArrayBuffer/default API and swaps displayed axes for the
defined EXIF cases. First-party PNG/WebP uploads are rendered upright before
encoding; JPEG rotations 6 and 8 also work through direct upload admission.

Photo/logo claims must match those derived display dimensions. Both routes store
the derived values and use them in idempotency matching/fingerprints. All header,
size, orientation and claim validation precedes digest calculation, durable
reservation, object writes and successful upload auditing.

## Evidence and corrected fixtures

Named image fixtures were produced by the existing exact Sharp development tool
and independently decoded during generation. They cover real PNG, baseline and
progressive JPEG, lossy/lossless/extended WebP, genuine JPEG EXIF 6/8, unsupported
GIF/AVIF and oversized 8,193-pixel/401-pixel boundaries. Positive signature-only
upload placeholders were replaced in photo, logo, share, real-D1 library and
folder tests. Sniff-only and low-level storage-lifecycle fixtures retain their
separate purposes.

- A raw Node smoke check passed PNG, both JPEG rotations and lossless/extended
  WebP. It first exposed exifr's raw CJS named-export mismatch; the documented
  namespace/default API resolves that without a rule waiver or module shim.
- New helper tests passed 16/16 after error expectations were corrected to the
  project's typed HTTP status contract; HTTPException messages are intentionally
  empty because its response carries the validation details.
- Real-auth upload cases cover owner/admin/editor positives and malformed-input
  negatives; viewer/non-member/anonymous refusal; actual MIME, wrong claims,
  oversized encoded dimensions, foreign workspaces/folders and neutral foreign
  preset resolution. The first run passed 31/32: the new folder fixture expected
  201 where that existing endpoint returns 200. Its exact folder-id assertion
  remains required after correcting the status.
- The full affected Node batch passed 90/91. The remaining share-rate-limit setup
  still claimed 1×1 for the new real 20×10 image. It now claims the actual size and
  explicitly asserts successful upload before exercising the unchanged rate rule;
  the five affected share cases passed.
- A later focused batch reported 53 passing assertions but still exited 1 because
  four asynchronous Node/Undici multipart producers attempted to enqueue after
  the existing unread-request guard canceled their streams. Passing assertions
  alone were not accepted as a green run. The new real-auth test helper now fully
  encodes actual multipart bytes before dispatching them through the unchanged
  application, authentication, byte limiter and multipart parser. Production
  middleware was not changed to hide a harness-only producer race.
- Final complete affected Node verification passed **91/91 in seven files**,
  session 69805, exit 0 with no unhandled errors. Final full types (57341) and
  scoped ESLint across sixteen changed source/test files (79625) also passed,
  exit 0. No rule suppression, coverage-floor reduction or timeout change was
  added to obtain these receipts.
- Existing Workers pool session 5110 passed all four actual-module cases: EXIF
  6/8, a 40 MiB File admitted from a normal header, and a 40 MiB malformed JPEG
  rejected under the original test deadline. Its aggregate test duration was
  1.83 seconds. JSON reporting suppressed numeric console metrics, so this receipt
  does not report measured CPU or peak memory.

The earlier ad-hoc Miniflare probe had three constructor-only schema rejections,
then stalled without a stream/memory receipt. Its exact owned process and child
were terminated; no native result was claimed. Further runtime evidence uses the
existing proven Workers test pool rather than new runtime infrastructure.

## Limits of this proof and next slice

This validates encoded dimension fields, not the complete compressed pixel
payload, every container field or complete image decodability. A damaged payload
can still expose valid dimensions. No full-image decoder or production CPU limit
was introduced.

Passing a single near-limit File in a local pool does not prove peak-memory safety
for multipart parsing, digest calculation, R2 transfer or concurrent requests.
Actual CPU/heap profiling, late-header behavior, full route/binding tests and the
combined security/browser/release gates remain required. Cloudflare documents
128 MB per isolate shared by concurrent requests and recommends local heap/CPU
profiling; local success is not a production memory-limit guarantee.
[Platform limits](https://developers.cloudflare.com/workers/platform/limits/),
[memory profiling](https://developers.cloudflare.com/workers/observability/dev-tools/memory-usage/).

M19 remains open. Next: review the isolated hash delta and final local source
receipts, then complete the remaining resource/full-route proof and integrate
against the verified seed. No Git commit, push, workflow retry, production
configuration change or deployment occurred in this slice.
