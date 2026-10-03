# Bounded static-error stack hint — isolated candidate, 2026-10-03

The observer still emits its existing classification, byte/capture counts,
completion/truncation flags and SHA256 prefix digest. A single additional
`stackHop` field is one of `gate_router`, `sdk_router`, `sdk_assets` or `unknown`.
It recognizes only whole anchored stack lines whose known fetch method and exact
allowlisted file basename agree. Installed source confirms gate fetch/Object.fetch,
RouterOuterEntrypoint/RouterInnerEntrypoint.fetch and
AssetWorkerOuter/AssetWorkerInner.fetch. Paths, messages, stacks, source positions
and dynamic identifiers are consumed only for matching and never emitted.

The helper examines only the existing maximum 4KiB prefix. Complete response bytes,
headers, routing and cancellation remain unchanged. Success and API/auth paths
remain excluded. The recognized enum identifies the first allowlisted frame
present in the bounded body, not necessarily its first/throwing frame or the
underlying network failure cause. Omitted, truncated, forged, mismatched or
unlisted frames produce unknown.

Actual isolated Node HTTP controls passed all ten complete bridge cases with no
skips. Stock source passed eight and failed the two new/strengthened observer
behavior assertions; no export/import error caused the negative result. The
candidate preserves all old cases, tests six known frame forms and eight negative
forms, rejects a known frame beyond the capture boundary, asserts the exact seven
output fields, forwards exact original bytes and excludes auth POST bodies with
random cookie/password/token canaries. Neither canary paths nor values appear in
console diagnostics. Parse-only checks also pass. Pre/post and private-log hashes
are in handoff.json; isolated import-location changes are absent from the patch.

Root source, Git refs/indexes, SDK bindings, browser and runtime probes were not
changed/executed. This is a diagnostic-only candidate; full current native asset
500s remain unresolved. After Root review and normal required verification, the
existing complete E2E run may collect the hint. If unknown remains, the missing
bounded datum is a source-confirmed fixed proxy/RPC frame enum from that same
prefix, requiring explicit review; no automatic allowlist growth, raw stack
logging, extra inventory probe or fallback is authorized. M19 remains open.

## Root integration

Root reviewed and integrated both paths with exact pre/post hashes matched.
The complete integrated gate pool passes 19/19, zero skips; scoped lint passes.
No response/routing correction is claimed. Current SAST and the normal full
four-device matrix are next; the fixed enum is a stack-presence hint only.
