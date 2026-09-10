# M19 publication security evidence

Date: 2026-09-09. Scope: local source and public-build gate implementation. Remote publication, screenshots, and the full integrated release gates are not certified by this report.

## Implemented checks

`npm run security:secrets` inspects nonignored working candidates, immutable Git index blobs, and all reachable Git history objects. It retains full-history Gitleaks and also scans historical blobs directly, including ZIP members from archives removed later. Index and reference snapshots must remain unchanged during the audit. No baseline, inline allow comment, scanner environment override, or `.gitleaksignore` bypasses this invocation. Existing precise public application-ID exceptions remain; configured private-value comparisons ignore scanner allowlists.

The pre-commit hook runs the gate after lint-staged finalizes the index. Quality/CI includes it and real scanner canary tests. The canonical build separately scans every regular file in `dist/client`, including copied assets and downloadable ZIPs. This checks browser-served artifacts, not private Worker code or local Wrangler state.

Private environment paths, credential exports, databases, keys, machine state, links, submodules, unsafe paths, and unmaterialized LFS pointers fail closed. Only exact `.env.example` and `.dev.vars.example` names are allowed as environment examples; their content still receives every applicable check. Ignored real configuration is never a public candidate. Project-root `.env*`/`.dev.vars*` and matching process variables are read privately to compare actual configured secrets as UTF-8, UTF-16LE, JSON escapes, URL encoding, base64, and hex. Values are never recorded. Unrelated global credential stores are not read.

Gitleaks 8.30.1 experimentally skipped `*.browser.test.ts`, treating the name as Brotli even with archive depth zero. Original-path candidates therefore also have neutral `.txt` mirrors with a fixed text prefix. Original paths preserve filename rules; neutral mirrors defeat filename/magic misclassification. Report line offsets are corrected. Scanner stdout, matches, and secret fields are withheld. Findings contain source identity, rule, and line only.

ZIP inspection validates local/central identities, CRC32, streamed expansion, paths, duplicate aliases, encryption, links, split/ZIP64 formats, overlaps, and trailing data. All bytes outside compressed streams are scanned as metadata, including comments and extra fields. Member names never become extraction destinations. Limits: 512 MiB total inspected candidates; 128 MiB ordinary file; 32 MiB compressed ZIP; 128 MiB total expansion; 64 MiB per member; 2,000 members; three archive levels; 200:1 expansion ratio. Other archive formats must be inspected/unpacked before publication. Temporary directories are resolved and checked inside the workspace before cleanup.

## Executed evidence

- `node --test scripts/publication.test.mjs`: nine passed. Real Gitleaks proves green, injected canary failure, exact restoration, and green for staged-only secrets and browser-test source. Additional tests detect deleted historical ZIP contents, configured secrets in binary browser output, and ZIP comments. Negative assertions ensure private values never appear in returned findings. ZIP tests cover traversal, aliases, CRC corruption, sizes, expansion ratio, encryption, symlink metadata, and excessive nesting.
- Focused ESLint for all four publication modules: passed, zero warnings.
- Local source gate: passed; 7,144 candidate/object checks, 44 archive entries, three configured private values compared. The ignored report is `temp/lumafoil-publication-audit/gate-source-report.json`. Counts describe that snapshot; later changes require another run.

## Remaining boundaries

Full quality, E2E, SAST, final rebuilt-output scan, and remote publication proof remain pending with the parent agent. Pattern scanning cannot certify arbitrary personal information, image pixels, screenshots, encrypted content, or unknown secret encodings. Public screenshots and operational prose require the separate review already assigned to the parent. CI intentionally has no production secrets; its report explicitly states that scope. Locally configured values are compared on the developer machine. Every result applies only to the inspected snapshot.

The shared CI installer now pins the SHA-256 of `gitleaks_8.30.1_linux_x64.tar.gz` before extracting the single named executable: `551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb`. The official [release checksum file](https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_checksums.txt) was retrieved on 2026-09-09 and matched against the downloaded archive; a one-byte in-memory mutation failed that comparison. Both source and deploy jobs use this installer. The deploy job skips browser installation because static build verification uses JSDOM. Publication path policy also rejects Python bytecode and `__pycache__` if forcibly staged.

The later canonical build passed the separate public-output scan with 2,319 candidate/object checks, 44 ZIP members and three privately compared configured values. New source or rebuilt outputs still require their own gate run.

## Repository-side controls

The later Picker-key remediation adds a digest-only retirement registry and
exact historical finding identity. Current source, staged content and built
artifacts receive no retirement exception; original-byte configured-secret and
archive checks still run before any historical scan-copy masking. A regression
proved that Gitleaks also loaded a repository-local ignore file despite an
explicit alternate ignore path; the independent scanner now inspects Git
metadata without that repository-level bypass. Fifteen publication tests pass,
including the red/restored-green ignore-scope control. Current source evidence
and the independently resolved GitHub alert are recorded in
[the key-retirement evidence](picker-key-rotation.md). Earlier counts above are
historical snapshots, not claims about the final release candidate.

GitHub's repository API confirmed secret scanning and push protection enabled on
2026-09-09. Private vulnerability reporting is also enabled and independently
read back. These complement the local candidate/history/archive scanner and the
CI gates; they do not replace inspection of documents, screenshots or release
artifacts. Version-tag deployment now waits for both quality/browser gates and
the shared pinned SAST workflow; remote Actions proof remains open.
