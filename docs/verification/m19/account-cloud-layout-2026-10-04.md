# Account cloud loading layout — 2026-10-04

Base: merged editor `ff4099476c05382fce0ef2128dc8eb633e1986b2`.
This fixes one confirmed producer; it does not certify M19 or deployment.

## Problem and correction

Actual unchanged cloud responses expanded loading card height by 522px desktop
and 638px phone, moving the following card by the same amount. The route's null
lazy fallback introduced another insertion boundary.

Account now imports its cloud card directly. Pending state reserves the three
known provider structures without exposing private status, identities or actions.
Pending/resolved headers share responsive grids so text does not select different
wrapping. Public permission markup is shared; a status region remains present.
Existing account-owner, refresh-revision, cancellation, configuration and stale
result controls remain. The existing spinner receives a visible size utility.

## Actual verification

- Fresh normal installation passes with zero audit findings and verifies the
  existing seven-file native patch. Scoped lint, forced full types, dead-code
  and seven cloud-card unit cases pass. Pending privacy negatives require no
  exposed identities/actions before genuine resolved controls.
- Real-account E2E passes four devices with two workers, zero local retries and
  original sixty-second test/ten-second assertion limits. It holds/parses only
  the real three-provider response and forwards it unchanged. Exact geometry,
  privacy and axe/reflow predicates all run. Times: desktop 19.1s, iPhone 28.7s,
  iPad 20.9s, Android 16.7s. Root views every ready capture.
- Setup reuses existing loopback-guarded real signup, mailbox verification,
  password authentication and workspace preparation. Cookies transfer only in
  memory to the test's own context; the API context closes. A precise Node
  declaration supports the existing JavaScript fixture without a wrapper,
  mocked authentication, dependency or production admission exception.

Normal five-trace audits retain cold origin storage/cache, original budgets,
content guards and HTTP/2 through the audit-owned pinned TLS certificate:

| Profile | Performance | Accessibility | Best practices | FCP ms    | LCP ms    | CLS        | TBT ms | Result                         |
| ------- | ----------- | ------------- | -------------- | --------- | --------- | ---------- | ------ | ------------------------------ |
| Desktop | 99          | 100           | 100            | 421.7722  | 662.8322  | 0.00000850 | 19     | Pass                           |
| Mobile  | 89          | 100           | 100            | 1801.5495 | 2795.3093 | 0.00827389 | 233    | Fail: performance, LCP and TBT |

Both layout-shift medians meet 0.02. Mobile startup remains a failure; no page
certificate or weaker threshold is inferred.

All four JSON/summary outputs are retained privately byte-for-byte. Two repeated
numeric trace blocks trip the zero-duplication gate; no source clone is found.
Moving only verified untracked outputs preserves evidence without changing a
rule/ignore. JSON SHA-256: desktop
`ba7878e6884828d4960682c5e6bab282ad51037201bd2d2e9a1b89a3ff65dcf8`, mobile
`81aade6edc8ee5d5e6c3a44d960257f5d1a6c677443815843e2705434262ff07`.

## Retained failures and limits

Earlier text-dependent wrapping shrank phone loading height by 104px; grid
corrects that producer. A diagnostic element capture then scrolled 198px between
measurements. A separate 20px shift came from the sign-in-methods loading row;
waiting for its genuine credential label isolates the cloud producer. All failed
logs/captures and initial lint/type/JSON-import setup failures remain.

Earlier full local quality fails eight cases across four integration files:
2,957/2,965 covered pass, original floors met. Auth deadlines and an Editor missing
group remain unproven; later stages did not run. First device run passes two and
fails two at onboarding/deadline prerequisites. Neither failure is replaced by
larger waits, retries or a weaker predicate. Full final quality/security and
protected hosted checks remain required before readiness.

Phone full-page captures place fixed navigation at the original viewport edge;
they do not prove universal scroll visibility. The owner's separate header rule
requires clipped content below retained header; its shared layout and actual
scroll/hit/pixel proof remain in progress. Sanitized teardown aborts and missed
transient process/profile history remain explicit. Known audit gate closes and
port 5273 is free.

Next: final static/security/publication and protected PR quality, while shared
startup/header corrections continue. M19 remains open.

## Displayed-account action boundary

Later source review reproduces an existing privacy race: a displayed owner's
connect/disconnect handler captures the new local owner before UI cleanup but
does not compare it with its displayed `userId`. The actual component/context
negative fails without correction: OneDrive disconnect is called once. Adding
the same owner comparison already used by refresh inside the existing action
try/catch blocks both mutations; the complete original-plus-regression file
passes eight cases. No new state, cache, credential or authorization authority.

The five-trace/four-device layout proof predates this small handler guard. It
does not claim to certify the changed mutation boundary. The matching eight-case
positive/negative proof covers that boundary; final exact-head quality and SAST
remain required. Pre-guard SAST passes 510 rules on 2,237 files, zero findings,
15 oversized skips. Its later publication command passes but is not relabelled
as a frozen post-guard scan. Normal protected CI will verify final source.
