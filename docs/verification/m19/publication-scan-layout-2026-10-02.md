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
