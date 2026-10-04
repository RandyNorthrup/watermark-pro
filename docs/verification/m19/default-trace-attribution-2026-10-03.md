# Existing default-trace attribution — 2026-10-03

Prepared on exact main `10aae8024744e9dbe203dac90a761d443cc9dd52` in an owned
isolated worktree. No production UI, auth/cache state, dependency, browser/CDP
configuration, budgets or existing guards change. Final Node proof passes 15/15 with zero failures/skips; scoped formatting and
corrected ESLint pass. No app audit or shared producer correction is claimed. M19 remains open.

The existing sanitizer now retains Lighthouse's finite scripting and
scriptParseCompile bootup costs. These LHR values retain its simulated multiplier.
Separately, existing MainThreadTasks supplies observed timing classes with actual
self/inclusive/start milliseconds. At most 64 timings and 20 generated coordinate
records are retained; discarded-valid coordinates are counted precisely (zero
at exactly 20). Known build source lines and SHA-256 digests compile once per
sanitizer call, with no global cache. The caller selects every manifest-listed JS
file, including dependency/vendor chunks, without an entry/src filter.

Coordinates match measured origin, build-listed JS and actual generated text
bounds. Direct FunctionCall/EvaluateScript/v8.compile sites follow installed
one-based normalization; synchronous FunctionCall stacks normalize nonzero
coordinates, while EvaluateScript/compile stack coordinates remain zero-based.
Foreign direct URLs cannot obtain attribution from an unrelated first-party
stack. Output contains no function names, original TypeScript symbols, raw URLs,
queries, text, stack or generated source. Build SHA verifies the declared build
text, not an independently sampled runtime byte stream. Without JS source maps,
chunk/route provenance and compiled event positions are the attribution limit.

A missing/empty Trace bypasses MainThreadTasks and yields finite unavailable
execution data; it does not claim an empty positive. Existing legacy diagnostics
remain. Tests cover native field shapes, precise direct/stack conventions,
missing/foreign/unknown-build/out-of-range attribution, malformed timings,
exact/exceeded caps, vendor chunks and privacy. One scoped lint attempt failed seven mechanical rules; its failed log is
preserved. The single correction changes condition/import ordering, numeric
separators and nested-call/condition syntax without changing trace guards. Final
exact formatted source passes the repeated 15-case proof (211.789 ms), scoped
Prettier and ESLint. Fresh normal own-tree npm ci returns 0 with unchanged lock
and no borrowed Root modules/cache. It emitted pending-install-script warnings;
no script approval/configuration change was made. This Node-only proof does not
certify native tooling or application/browser performance.

Prior diagnostic attempts remain failed: 36023 grouped operations and discarded
safe error metadata; 36476 received an unclassified Lighthouse runtime failure
before a later sampler-stop error; 54076 passed real HTTP/H2 and finite metrics
and returned a profile, then failed its sample guard before primitive counts were
retained. Its 404 case never ran. Those outcomes do not show that Lighthouse's
measurement pipeline is broken. Their owned resources are independently closed.
Custom sampler/control expansion stops; actual normal default-trace data is the
next evidence source. Old 7a3/d5ee evidence is historical, not current-main proof.

Current Account lower-card shifts and cloud-panel geometry remain a separate,
unproven causal boundary. No Account fix or render/i18n/router optimization is
selected before actual timings/source evidence. Next is Root source-manifest
review, scoped tests/style checks, then a separately released normal audit.

Final source and proof/log hashes are recorded privately in
`temp/default-trace-proof/final-manifest.json`. The exact three-codepath patch
can combine with the separate SDK/fixture slice after Root review. Full combined
quality/security/release gates and actual normal-audit attribution remain open.

## Actual normal-trace integration — 2026-10-04

The combined current client build executes one normal desktop Login audit:
five original traces, strict H2/content/metric budgets and CLI terminal 0.
All five traces have available observed timing evidence and twenty nonempty
bounded generated coordinates verified against that build's listed JS/text/digest.
Scores are 100/100/100; median FCP 361.264 ms, LCP 617.264 ms, CLS 0 and TBT 36 ms.
Only sanitized JSON/summary is emitted, with HTML/raw-LHR/Trace/URL/stack/function
fields absent. This selected integration closes the earlier normal-trace gap;
it does not identify original TypeScript producers, certify other pages/mobile
performance or resolve the open Admin canonical-query fixture. Earlier failures
and isolated proof limits remain recorded.
