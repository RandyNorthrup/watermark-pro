# Storage producer fence — isolated M19 candidate

Prepared 2026-10-03 on `codex/storage-producer-fence` from the exact 282-path
snapshot manifest SHA256
`dcf385d2cdb14d0ed03b0a720d48f711c18287c5ce019e2dfdee1fb6c18fb194`.
The copied source/destination hashes and modes match; no credentials or modules
were copied. Independent npm ci succeeded with 795 packages and seven existing
high advisory findings, unchanged and unwaived. An initial copy collided with
unfinished Git checkout; the completed checkout was recopied and all 282 paths
were verified before the final independent installation. No code was edited in
that incomplete copy.

Only the approved storage producer fence is in scope. Personal account cleanup,
retention/admission policy, provider configuration, new tables/keys/jobs,
dependencies and production changes are excluded. The initial actual D1/R2 test
pauses the existing payload writer, expires its reservation, completes cleanup
and releases its recovery pointer, then resumes the writer. Session 33326 failed
exactly that physical assertion: the three-byte opaque payload reappeared after
cleanup and failed metadata commit. The earlier assertions confirmed reservation
absence and typed 503. This is a real binding defect, not a setup-only failure.

The conditional candidate must initialize an empty object only when absent,
recheck the current durable lease and live writer, and require the resulting ETag
on payload writes. Failed R2 conditional writes return null, which must produce
a typed failure. The seven approved runtime paths now implement that candidate;
they remain uncertified until actual interleavings pass. Initial affected Node
tests passed 49/49 and full types passed. Adding six real-auth role controls first
produced 55 passing assertions but exit 1 from Undici's lazy multipart producer
racing an intentional early refusal. Genuine multipart bytes are now fully
encoded before those requests; the real auth/body limits/statuses are unchanged.
The corrected target passed 18/18, then all four affected Node files passed 55/55
with no unhandled errors. Current full types and scoped lint on eleven source/test
paths pass. Actual D1/R2 session 60031 passed 10/10 null/empty-marker/ban/role/
started-stream and late-payload controls. The started-stream test has since been
strengthened to await marker deletion while remaining bytes are withheld and
require a null result; it no longer has an observation timer or serialization
branch. An explicit interruption plus failed-abandonment recovery control is also
added. Final actual binding session 26346 passed 37/37: eleven producer controls
and all 26 existing upload cases, without skips/name filtering. The started put
consumes its first byte; marker deletion completes while the remaining bytes stay
withheld, then the resumed conditional put returns null and R2 lookup stays empty.
Late initialization creates no payload, interrupted precheck/failed abandonment
preserves only an empty marker plus durable recovery, then real cleanup removes
both. This is controlled interruption fault injection, not an actual isolate kill.
Existing real D1 lost-ack/committed-file, quota, paid expiry and cleanup cases pass.
The extra initialization adds one R2 Class A operation per object, two additional
operations per photo with thumbnail; no fixed cost/profit guarantee follows.
Official API reference: [Cloudflare R2 conditional operations](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).

Read-only inspection of installed Miniflare's R2 implementation found stream/blob
consumption at bucket.worker.js:974, followed by transactional conditional put at 988. Lines 716–718 recheck the current ETag in that transaction. SHA256:
`d5a79dac44f1529d7a6b51d4ff6056843cfaeeeabbffca588a74d5af187ffc56`.
This supports the local candidate, not a replacement for actual binding races or
remote-service proof. A late initializer may leave only an empty object after its
lease vanished; its opaque key is not a claim of immediate complete erasure.

No browser/scanner/full quality/CI/commit/push or deployment was run for this
candidate. The original-protocol native negative and first corrected ten-case
binding suite and final 37-case strengthened/regression suite ran. Full current
types, eleven-path scoped lint and fourteen-path format check passed. No full
candidate quality/SAST/browser certification is claimed; Root's combined-source
gates and unchanged audit blocker remain distinct. M19 remains open. Next review
and integrate this exact seven-runtime-path delta before authorizing personal
account cleanup; no purge was implemented.

Root's later fixture-only key shortening and logo-count scalar changes are outside
this snapshot. The handoff contains exact ancestors so those test improvements
can be preserved during three-way integration, rather than overwritten.
