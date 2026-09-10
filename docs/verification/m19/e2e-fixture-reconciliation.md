# E2E fixture reconciliation — 2026-09-09

The interrupted full E2E run contained three stale fixture assumptions before
the Wrangler proxy failure. These corrections preserve the actual product
contract and strengthen account/workspace assertions; no application behavior,
permission check or quality threshold was changed to satisfy an old test.

## Current onboarding and collaboration behavior

Email verification admits the account to its automatically provisioned private
workspace at `/app`. A new login also starts in that personal workspace when
the new session has no explicitly selected collaboration. Creating a separate
collaboration remains an explicit action under `/app/organizations/new`.

The dashboard heading follows the selected organization's name. Therefore the
initial `My workspace` heading does not prove that a previously created
collaboration is selected. The sign-in fixture now verifies the private
selection and account first, chooses the requested collaboration through the
real organization switcher, and checks the resulting heading, visible selection,
server session and membership. The switcher helper uses the mobile menu when
the desktop sidebar is hidden.

`expectActiveWorkspace` parses the actual session and full-organization API
responses with the application's shared schemas. It asserts the expected
account identity and verified email, the active organization ID, and a matching
membership/user row. The onboarding journey verifies sole owner membership in
the initial private workspace, then explicitly creates a distinct collaboration.
After invitation acceptance, the viewer must have a viewer membership in that
joined organization, separate from their original private workspace.

The audit-denial request now targets the actual joined organization ID instead
of a nonexistent placeholder. The library viewer mutation uses a valid preset
payload and the verified joined workspace, while retaining the expected 403.
These assertions distinguish a genuine insufficient-role denial from a
non-member or invalid-input failure.

## Exact font control

The designer now has both `Search fonts` and `Font` controls. The old substring
label query matched both. The library journey selects the exact `Font`
combobox, asserts that its value becomes `Pacifico`, and retains the saved-preset
and rendered-preview checks.

## Separate offline readiness and infrastructure failures

The desktop conflict journey did not reach conflict resolution. It failed while
waiting ten seconds for `App files are ready for offline use.`; the visible page
still reported that offline app files were being prepared. The original preset
had been saved and reopened, but the offline transition had not begun. Its
readiness and conflict assertions were retained while the actual installation
and proxy behavior were investigated.

The later phone/tablet conflict contexts show connection refusals after the
proxy stopped. Those failures are not evidence that keep-both conflict recovery
itself failed. The release owner owns the separate gate-server repair.

After the isolated SDK gate repair, the desktop conflict trace showed a real
installation still in progress: the service-worker script loaded at 37.72
seconds, its 2,175-file inventory finished loading at 38.85 seconds, and the
readiness assertion ran from 53.37 to 63.39 seconds while six static downloads
were still active. The conflict fixture had omitted the service-worker
readiness/controller prerequisite already used by the other offline journey.

Both offline journeys now await `navigator.serviceWorker.ready`, verify that
the `/sw.js` controller owns the page, and retain the exact ready-status UI
assertion. No assertion, test or action timeout increased; the existing
`test.slow()` journey limit bounds installation. The targeted desktop conflict
rerun passed in 31.9 seconds, including preservation of both versions and
their offline reload. The gate's failure counters did not increase during
that rerun. The passing log is
`temp/lumafoil-offline-conflict-lifecycle.log`.

The later four-browser diagnostic matrix exposed local installation contention,
not an observed transient static-download failure in the two desktop offline
traces. Both continued downloading required sticker files until the existing
180-second journey deadline. Of 2,175 manifest URLs, 1,895 and 1,890 respectively
had completed responses; the remaining requests were still progressing. Every
completed static response was 200 or 304. No service-worker failure message was
recorded in those traces, although they did not capture registration state at
the deadline. The complete inventory is 38,839,936 bytes, including the virtual
offline shell's actual index document. It was not reduced or replaced.

The unchanged built artifact then passed both desktop offline journeys together
with two Playwright workers in a reported 1.1 minutes total. Installation,
controller ownership, exact readiness text, real saved data, lost-acknowledgement
recovery, conflict preservation and offline reload all remained asserted within
the original limits. No service-worker retry, transport retry, inventory
reduction or timeout increase was added. The separate output directory
`test-results/offline-paired-sdk` preserved the diagnostic matrix traces; the
passing log is `temp/lumafoil-offline-paired-workers2.log`.

The same diagnostic matrix found a distinct WebKit fixture race before offline
readiness: the conflict test could read the old synchronized status immediately
after clicking Save, before the local outbox updated it. The page then showed
one pending save while the immediate server list was still empty. The fixture
now polls the actual server preset count before using its server version, as the
first offline journey already did, and retains the synchronized-status check.
The Recents journey also now awaits actual service-worker readiness before its
existing controller assertion. Those fixture changes need their final device
matrix proof; they do not establish that a failed installation should be retried
or hidden.

## Verification boundary

The original error contexts are under `test-results/`, and the interrupted run
log is `temp/lumafoil-e2e-release-current.log`. Focused ESLint and Prettier passed
for `e2e/support.ts`, `e2e/onboarding.spec.ts` and `e2e/library.spec.ts` after these
edits. The release owner's first repaired-gate desktop batch passed ten tests
and exposed the separate PDF-helper and offline-lifecycle fixture failures.
The offline conflict rerun above is now green. The full device matrix and
release gates still require their own complete run; these focused results do
not certify the earlier interrupted E2E run or the broader milestone.
