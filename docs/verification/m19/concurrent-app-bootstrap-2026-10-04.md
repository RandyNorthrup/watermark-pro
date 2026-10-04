# Concurrent authenticated startup verification — 2026-10-04

This isolated candidate is based on main
`83546028cc1236aec407f2425e5fbd9ca3dbb619`. It changes only
`app-bootstrap.ts`, `offline-account.ts` and their real transport/admission
regression file, plus this receipt and factual PLAN/CHANGELOG entries. It has
not been committed, pushed or deployed. M19 remains open.

## Proven boundary and reassessment

The preserved real Admin diagnostic reached a verified owner session and two
successful bootstrap responses, with no failed assets or page errors, but showed
the existing account-generation error boundary. Its response identity/order was
not retained, so the precise browser interleaving remains unknown. The real-unit
fixture independently proves a controlled concurrent cold-start interleaving:
both calls use the production loader, bootstrap transport, activation, query
client and epoch protections. Only transport and platform-lock timing are
controlled inside the test file; protection/admission functions are not mocked.

The stock real-route counterfactual passes 40 of 41 cases and fails the positive
same-route/same-account admission and one-request assertion. An initial
pending-flight candidate passes 44 of 45 cases but fails when another call enters
while real account activation waits for its platform lock. Its own synchronous
reset already advanced the epoch. The next ambient-handoff candidate passes
48 of 49 cases but incorrectly joins a stale flight after an actual synchronous
lock during the reset event. These three red boundaries remain failed history;
changing a candidate does not reset that history. The earlier counterfactual
using an unreal Admin subpath is also retained separately.

Whole-interface review identified the unsafe inference: an ambient epoch captured
after activation starts can belong to an unrelated lock. The coherent correction
uses the activation's existing transition generation and offline fence, rather
than treating a newer ambient epoch as proof of its own successful transition.

## Corrective contract

- Share only an unfinished whole boot for the same QueryClient and pathname
  while its authority remains current. Different route policies remain separate;
  no settled success or failure is cached. Identity-checked cleanup cannot remove
  a newer flight when an old request settles.
- Preserve existing transport/admission checks and every existing
  `assertTransition` check. Activation adds an optional callback, so existing
  callers remain valid. Its own reset captures and publishes the existing
  generation/offline fence immediately after setting the owner to null, before
  retention, query and account-event observers. Same-owner activation publishes
  its unchanged scope before queued storage work.
- Validate that composite authority before committing the owner. Publish the
  final owned fence immediately after the owner assignment and before retention
  or announcement observers. The loader validates the supplied final assertion
  after activation and before seeding. Real locks, switches and context-only
  owner changes therefore cannot be adopted as this boot's own epoch.
- Add no counter, lease, settled cache, dependency, replay fallback or separate
  admission framework. Existing reset/cleanup behavior and online-only policy
  remain load-bearing.

## Executed proof

Commands use Node 24.18.0 and the existing Python 3.13.7 launcher in command PATH.
Installed modules are a normal physical installation owned by this tree.

| Check                                                                                                      | Actual result                             |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Scoped Prettier check, three code paths                                                                    | Exit 0                                    |
| Scoped ESLint, unchanged rules and zero warning allowance                                                  | Exit 0                                    |
| Fresh full `tsc -b --force`                                                                                | Exit 0                                    |
| Complete `unit-client` files: `bootstrap-request.test.ts`, `app-bootstrap.test.ts`, `private-boot.test.ts` | Exit 0; 53/53 passed, zero failed/skipped |
| Existing complete `browser` file: `offline-account.browser.test.ts`                                        | Exit 0; 11/11 passed, zero failed/skipped |
| `npm run deadcode`                                                                                         | Exit 0                                    |
| `npm run i18n:check`                                                                                       | Exit 0                                    |

The final real-client file covers both concurrent cold success and entry during
real activation's platform-lock wait; different-route offline policy; actual
lock/switch/late foreign success; A-to-B-to-A reentry; old-flight cleanup versus a
newer pending flight; fresh reads after settlement; synchronous reset-event lock;
synchronous final-announcement lock/switch; and direct same/foreign owner changes
while storage is waiting. Rejection assertions also verify that stale queries
were not seeded and the current owner was not overwritten. The existing browser
scope exercises actual Chromium/IndexedDB isolation, pending-work preservation,
cross-tab events, same-owner reopen and delayed sign-out cleanup.

The first scoped lint command failed with 22 style findings in the new code/tests.
Mechanical syntax corrections preserved assertions and identity cleanup. The
first fresh type check then failed with TS2454 because the async cleanup IIFE
referenced its flight during initialization. Root reviewed the named local async
`try/finally` correction; it preserves the awaited request and identity check
without a mutable placeholder or suppression. Final style/types and all 53 client
cases pass after that correction. The earlier 11-case browser logic did not
change, so it was not repeated merely for the cleanup syntax.

## Limits and next slice

The browser test process finished before the attached PID/profile snapshot;
no per-browser identities were captured during that short run. Authoritative
terminal status is zero, and post-run candidate-CWD inspection found no Node or
browser runtime. No unidentified storage or process was removed. Private reports
and earlier failures are retained without exporting tokens, bodies or raw logs.

This slice did not run complete quality, SAST, application E2E, Lighthouse or
screenshots. It changes startup behavior without styling; it does not certify
the current Admin screen or claim that the original browser response order is
known. Root next reviews the frozen patch, combines the independently reviewed
privacy/release source, runs the unchanged complete gates and performs fresh
actual Admin integration/browser proof. No thresholds, deadlines or rules were
changed, and feature expansion remains held.
