# Publication scan staging — 2026-10-02

Status: candidate under verification on `codex/resolve-video-editor`. Four normal
commit attempts refused publication at the unchanged five-minute Gitleaks scanner
deadline. Thread-limited and idle-host retries did not produce passing receipts.
No hooks, content, rules, historical references or deadlines were bypassed.

Read-only process inspection printed only scanner mode and numeric process
metadata. History scanning completed; the candidate-directory scanner timed out.
Staging created a separate original directory tree for every distinct object,
alongside its neutral copy. An observed stage held 18,346 files before cleanup;
that count alone is not a timing or scan-success receipt.

The candidate assigns a version ordinal independently for each original path.
Different paths share ordinal directory trees. Distinct versions of the same
path still get separate files, preserving original filenames, path rules and
bytes. Neutral prefixed copies remain independently numbered. The first grouped
layout attempt also timed out, so directory grouping alone was not sufficient.

Staging now also shares a copy across current and historical inspection only when
the original path, original bytes and scanner treatment are identical. Masked
retired-history copies have a separate fingerprint from current unmasked bytes;
an exception cannot suppress a current file. Every original object still gets
configured-value and path inspection before staging deduplication. Different
paths remain separate, preserving filename-specific rules. A reported copy count
distinguishes scanner work from the unchanged original object-check count.
Configured-value comparison, ZIP metadata/member inspection, history scanning,
limits, redaction and cleanup remain unchanged.

The new real-scanner regression puts a synthetic unsafe member in the first ZIP
and a clean member at the same path in the later ZIP. It must report the earlier
member without exposing its canary; removing that archive must return green.
Existing staged-private/clean-working and historical ZIP controls also remain.
The initial complete batch passed twenty scanner regressions. The strengthened
collision case adds a filename-specific fixture rule, so a neutral copy cannot
conceal an overwritten original-path copy; it passed independently. Deliberately
reusing version zero then made that case fail (exit one). The runner restored
the original source bytes exactly in a finally block. The final complete batch
again passed all twenty cases, and lint plus zero duplication passed. Full
repository publication timing remains pending. No security or video milestone
is certified by this change. The further copy-sharing candidate adds a real
fixture covering three unchanged paths plus commit metadata and two trees. Its
first count assertion omitted metadata and failed; the corrected control requires
twelve inspections, including every tree, and eight scanner copies. It passed.
Deliberately restoring duplicate current/history staging made that control fail
(exit one); original source bytes were restored exactly. The first expanded
batch passed twenty safety cases and failed only the metadata-count assertion.
Final execution passed all twenty-one cases; lint and zero duplication passed.
Full repository publication timing remains under verification.

Full source publication subsequently passed in the normal commit hook for
`c5d1d3baa95c1f3c2bc525fb2d9a179567c216af`: 15,019 candidate/object checks,
12,580 scanner copies and 183 archive entries. Five revoked-key occurrences were
masked only in historical copies; one exact immutable historical finding was
accepted. No configured private values were available in this checkout, so this
receipt establishes pattern/path/archive/history scanning, not comparison against
live production credentials. The unchanged scanner deadline and hooks passed.
The source was pushed; canonical CI and Linux AAC stage diagnosis are pending.

Subsequent diagnostic publication still timed out at 300,000 ms, including an
isolated attempt with no other owned scan running. On 2026-10-02 the scanner's
bounded processing allocation becomes 600,000 ms. Earlier unchanged-deadline
receipts remain accurate for their source; this later candidate has a documented
resource allocation change. It does not change byte/archive bounds, rules,
original-object inspection, retired-history exception boundaries or rejection
on timeout. No application, native waveform, device or UI performance deadline
is increased. Final candidate regressions and full scan execution remain pending.

The first allocation-change batch passed twenty-one cases and missed one random
generic canary in a historical ZIP; an isolated rerun with a new value passed.
The pinned [Gitleaks 8.30.1 generic rule](https://github.com/gitleaks/gitleaks/blob/v8.30.1/config/gitleaks.toml#L563)
uses a 3.5-bit entropy threshold and substring stopwords. A stopword collision is
consistent with the observed random failure, but the removed original fixture
prevents proving that specific cause. The test helper now produces a balanced,
deterministic synthetic value with restricted letters, keeping the same negative
historical-entry assertion and all production rules. This scope control does not
claim generic heuristics recognize every possible unknown secret; configured-value
comparison, forbidden paths and provider patterns remain separate safeguards.
Final execution passed all twenty-two scanner/timeout cases and lint. Complete
repository scanning under the new bounded allocation remains pending.
