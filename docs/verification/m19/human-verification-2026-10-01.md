# Human verification and account boundaries — 2026-10-01

Verification continued on 2026-10-02. Runtime source: `b90815588221c213ebd41983afa784c998289058`.
[Draft PR #12](https://github.com/RandyNorthrup/watermark-pro/pull/12) remains unmerged;
[CI run 36976426895](https://github.com/RandyNorthrup/watermark-pro/actions/runs/36976426895)
passed all seven checks for that source.

## Scope

This M19 slice implements required production human verification for account
admission and recovery. It remains isolated on `codex/public-billing`, based on
the protected CI/CD baseline. Public billing, public signup, private invitation
grants and paid workspace entitlements are separately tracked in
[the billing specification](../../plans/public-billing.md); this receipt does
not claim those features or M19 release certification.

## Implemented controls

- Production configuration requires HTTPS and a complete pair of real Turnstile
  keys. Documented provider test keys cannot enable production admission.
- Signup, password sign-in and OAuth entry require an admission challenge.
  Password recovery and verification-email resend require a recovery challenge.
  The server checks the canonical hostname and exact action, independently of
  client controls. Malformed/missing/oversized tokens are refused before the
  provider request. Rejected, expired, replayed and incorrectly bound tokens
  cannot create a session or account.
- Siteverify accepts at most 8 KiB of streamed JSON and requires actual boolean
  success. Malformed JSON, excessive bytes, non-boolean success, outages,
  cancellation and redirects fail closed. A ten-second deadline bounds the
  provider request. The server sends only its verification key and the opaque
  challenge token; errors have fixed messages and omit private provider details.
  The test-only provider URL injection is unavailable through Worker environment
  variables or request input.
- Verified email, current session, bans, account bindings and workspace/site roles
  remain independent. Existing unverified/banned cookies cannot reach custom APIs
  or privileged Better Auth organization/admin endpoints. Another verified actor
  remains able to use authorized endpoints, and denied mutations preserve state.
- Client forms remain disabled while configuration is unknown/unavailable or a
  required challenge is unsolved. Email and OAuth share one challenge; every
  attempted request discards it. Expiration and widget errors clear it. Retry
  removes failed script tags, and removed widgets cannot deliver stale tokens.
- The widget uses measured container width to choose documented 300×65 or
  150×140 dimensions and reserves space before script loading. Resizing removes
  the preceding widget and invalidates its token. Twelve locales include the
  human-verification guidance and provider privacy disclosure.
- The local gate transport accepts HTTP absolute-form only for its exact origin
  and Host. Foreign origins, forged Host, credentials, fragments and forbidden
  body forms remain refused. This preserves WebKit redirected requests without
  relaxing application authorization.

## Privacy and limits

A challenge is an abuse signal, not proof of real-world identity or general
trust. It grants no role, paid entitlement, invitation right or membership.
Private content continues to require server authorization.

Avoiding identifiers in the server verification body does not make the browser
widget anonymous: Cloudflare receives browser/network signals, including the
connecting IP. The public privacy page now explains that distinction and links
the [Turnstile Privacy Addendum](https://www.cloudflare.com/turnstile-privacy-policy/).
Lumafoil does not add an application-owned device fingerprint or collect identity
documents for this slice.

Authoritative token semantics and widget dimensions were checked against
[server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
and [widget configuration](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/).

## Executable evidence

| Gate                       | Current evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Independent dependencies   | `npm ci` passed: 786 installed packages, zero audit findings. Temporary symlinks were removed only after verifying their ownership/type.                                                                                                                                                                                                                                                                                                                                 |
| Focused server/client      | Six files, 101 tests passed, including provider cancellation/privacy and existing unverified/banned workspace/admin sessions.                                                                                                                                                                                                                                                                                                                                            |
| Corrected fixture checks   | Two files, 30 tests passed after replacing a non-configurable test-global assignment with a constructor spy.                                                                                                                                                                                                                                                                                                                                                             |
| workerd/D1 admission       | One integration test passed against real Better Auth, D1 and rate-limit bindings. Provider replies are explicitly named fixtures.                                                                                                                                                                                                                                                                                                                                        |
| Complete quality           | Hosted `npm run quality:ci` (which runs `npm run quality`) passed on runtime source `b908155`: 2,830 covered tests, all coverage floors, 64 workerd tests, every script gate and production build. Five earlier local attempts failed at documented lint/native/fixture checks. The sixth local duplicate cleared source gates and was explicitly interrupted (exit 130) during covered tests after the exact-source hosted gate passed; it is not a local quality pass. |
| Performance harness        | All 36 tests passed with the production readiness deadline. A later full-run lint check caught the stalled-decode fixture's empty callback; replacing it with `Promise.withResolvers().promise` passed focused lint and all four native content tests. Wrong-screen/content/view and stalled-image negatives remain exercised.                                                                                                                                           |
| SAST                       | Local staged-source scan passed; exact committed-source hosted scan also passed: 510 rules, 2,135 targets, zero findings.                                                                                                                                                                                                                                                                                                                                                |
| Four-device Playwright/axe | Hosted full matrix passed 136 journeys: 34 each on desktop Chrome, iPhone, iPad and Android; the required aggregate also passed. Local challenge-only verification passed all eight cases across the same four device projects with axe. Named provider fixtures prove client lifecycle/bounds, not live Turnstile availability.                                                                                                                                         |
| Viewed UI screenshots      | Viewed all four local challenge-fixture captures: normal/compact provider dimensions remain within the card and no horizontal overflow. Also viewed actual anonymous auth UI in English desktop light/dark and Arabic phone light/dark; no clipping or recorded browser errors. Fixture controls are deliberately synthetic and do not represent the live provider artwork.                                                                                              |
| Production Turnstile       | Owner-completed browser login restored Cloudflare OAuth. Readback confirms the existing widget uses managed mode, allows only `lumafoil.com` and has a secret; the production Worker secret-name list includes `TURNSTILE_SECRET_KEY`. No duplicate widget, key rotation or deployment was performed. This does not prove a live challenge against the new code.                                                                                                         |

Local detailed logs are kept outside publication artifacts. No credential values
or authentication links are included in this receipt. Vitest uses two workers,
with native browser files running serially after Node suites. Application readiness deadlines, Playwright journey budgets, native Vitest
case deadlines and global coverage floors remain unchanged. Content-harness
fixtures now use the actual production readiness deadline as described above.

## Planning status and next slice

M19 stays open. Implementation quality, SAST, the complete four-device browser
matrix and viewed auth UI evidence passed for the runtime source above. Verify
live challenges against the new code after all deployment gates pass. Existing production Turnstile
resources are present; credential values remain private. Continue public/private
cohort admission, atomic two-invitation
budgets, Stripe signed-webhook/checkout ownership and server-enforced paid
workspace limits. Existing video export/offline regressions and the unchanged
Lighthouse/screenshot release matrix remain blockers before production deployment.
