# Combined global test receipt — 2026-10-03

The actual `npm run test` on the visually reviewed integrated candidate exited 1.
It ran 288 covered files: 285 passed and three failed; 3,203 cases passed and six
failed. Statements 92.71%, branches 85.76%, functions 92.63% and lines 93.79% all
meet the unchanged 90/85/90/90 floors. Coverage success does not make this a passing
test gate. The chained codec, Workers, bootstrap/script and build stages did not
run after the covered stage failed. This receipt precedes the isolated operation,
encoded-image and billing-review corrections.

Four failures were stale contracts: legal tests still required public invitation
copy that the public-launch candidate intentionally removed, and two exact
administrator config assertions omitted public-signup and billing availability.
The corrected expectations retain verified-email, explicit workspace grant, safe
provider/contact links, offline-copy disclosures, public-cohort absence negatives
and exact config fields. Formatting/scoped lint and all ten cases in those two
files passed after correction. No runtime behavior or gate changed. Full TypeScript also passed.

A separate explicit run passed all 55 SDK-patch, CI/GitHub-policy and owner/cohort/
workspace migration/bootstrap controls. These are named subsets executed after
the chain stopped; they do not certify the unexecuted Workers, codec, performance,
publication or assets stages.

Two failures remain in actual Chromium AAC gap fixtures, one in the page and one
in a Worker: `maximumGap > 0.9` was false. Native timestamp/presentation and active/
silent waveform checks did not fail. Review must distinguish browser/native SDK
behavior and measurement before changing any product code or contract. No AAC
assertion was weakened.

The adjacent JSON records counts and hashes of private local logs. Raw logs are
not published because authentication fixtures can contain disposable credentials
and sessions. Full quality/audit, SAST, device, release and provider certification
remain open; M19 is not certified and production flags remain closed.
