# Platform observability privacy — 2026-09-09

## Finding and decision

Cloudflare adds request metadata to persisted custom `console.log` records.
Disabling invocation records does not remove that enrichment. An isolated hosted
probe confirmed that a fixed, sanitized application message still persisted a
synthetic bearer-path value in `$workers.event.request.url`,
`$workers.event.request.path` and `$metadata.trigger` with
`logs.invocation_logs: false` and `redact_query_string: true`.

Query redaction removed the synthetic query value from that observed record,
but the path remained. A positive control with redaction off and invocation
records on persisted both synthetic path and query values on the custom record,
as well as a separate automatic request record. Application message sanitization
and disabling automatic invocation records therefore do not establish a safe
persistent platform-log boundary for share, invitation and password-reset URLs.

The default and production Wrangler environments now disable platform logs and
traces, including their persistence, and retain query redaction as a defense if
observability is later reconsidered:

```json
{
  "observability": {
    "enabled": false,
    "redact_query_string": true,
    "logs": {
      "enabled": false,
      "invocation_logs": false,
      "persist": false
    },
    "traces": {
      "enabled": false,
      "persist": false
    }
  }
}
```

This changes deployment configuration, not application error reporting, D1
health/error records, audit events, administrator authorization or their
retention controls. Their independent application tests remain necessary.
The accompanying application-report hardening uses finite error classifications,
bounded same-origin compiled-JavaScript coordinates and known route shapes with
content identifiers redacted; it does not transmit arbitrary error/rejection or
stack text, and the API normalizes direct callers without storing raw user agents.

## Hosted method and observations

Only one uniquely named temporary `lumafoil-logging-probe-*` Worker was created
on the existing account. Its name was checked absent before deployment. It had
no secrets, application variables, D1/R2 bindings, custom domains, routes or
other services. An isolated operating-system temporary directory supplied its
Wrangler configuration, preventing the main project's Vite deployment redirect
from selecting a production artifact.

The source emitted a fixed message, a fixed `/probe/:id` route pattern and a
synthetic phase marker. It did not read a request URL, headers or body. Only
test-owned random path/query markers were sent to its workers.dev endpoint.
The positive-control and disabled phases returned distinct response bodies to
verify which deployed version answered before interpreting their results.

| Phase                                                        | Persisted custom payload observed                                                             | Path marker in custom metadata | Query marker in custom metadata |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------- |
| Invocation records off; query redaction on                   | Yes                                                                                           | Yes                            | No, in the inspected record     |
| Positive control: invocation records on; query redaction off | Yes                                                                                           | Yes                            | Yes                             |
| Platform logs/traces disabled                                | Provider configuration and live-tail behavior verified; no assertion of universal log absence | Live tail still includes it    | Live tail still includes it     |

Persisted records were read through the authenticated dashboard, restricted to
the temporary Worker. The existing Wrangler OAuth token could deploy and tail,
but the separate Workers Observability query API returned 403. No browser token
was extracted and no hidden dashboard API was called. An initially empty
dashboard was treated as an ingestion delay, not a privacy pass. Only the later
visible custom records and their expanded fields establish the comparison.

The disabled configuration deployed successfully. The provider's overview
showed **Workers Logs Disabled** and **Workers Traces Disabled**, and the settings
API omitted its observability block. A request returned the disabled phase's
distinct body. A real `wrangler tail` still received the fixed diagnostic and
phase marker. This verifies that disabling persistent platform observability
does not turn off useful live console diagnostics; it also proves that live
tail output requires private handling because its envelope retains request URLs.

The tail was stopped. The exact temporary Worker was then deleted through its
identified API resource; an independent settings lookup returned 404. The task's
browser tab was closed. The production Worker, its bindings, credentials,
routes and deployed observability settings were not changed by this probe.

Private local evidence is under `temp/lumafoil-logging-probe-evidence/`, including
deployment/readback receipts, version-pinned response checks, the disabled-phase
tail and deletion confirmation. Raw tail metadata must not be published. The
controller and isolated source are diagnostic evidence, not application code.

## Local regression and release boundary

`src/worker/observability-config.test.ts` parses the actual JSONC configuration
and asserts the privacy profile independently for the default and production
environments. Both assertions failed against the preceding enabled
configuration. After the correction, 16 tests across configuration, sanitized
Worker logging and health behavior passed. Logs are
`temp/lumafoil-observability-config-{red,green}.log`.

This filesystem harness is checked in `tsconfig.node.json`, alongside the
existing Node service-worker harness, rather than against workerd's incompatible
filesystem/runtime declarations. It remains in the canonical Node unit-worker
test suite. Focused ESLint, Prettier and the full TypeScript build passed.

The post-build test in `scripts/verify-built.test.mjs` follows the actual
`.wrangler/deploy/config.json` redirect, requires its destination to remain in
the current output tree, and checks the generated Worker's observability profile.
It was observed rejecting the existing pre-change artifact, whose profile was
still `{ "enabled": true }`; the log is
`temp/lumafoil-observability-built-red.log`. A fresh project build and its green
compiled-output result are part of the release owner's full quality run, not
claimed by that red check.

## Production logging-only remediation

After the isolated probe, the release owner disabled Logs in the existing
production Worker's authenticated dashboard settings and deployed that bounded
settings change; Traces were already off. This was a logging-only remediation,
not the final application release or domain cutover.

An independent read-only API check at **2026-09-10T01:52:30.654Z** verified the
expected existing Worker and its binding types privately. The provider settings
omitted the observability block, consistent with the disabled representation
verified by the hosted probe. The derived live states were:

| Check                               | Independently observed result                     |
| ----------------------------------- | ------------------------------------------------- |
| Platform logs enabled               | `false`                                           |
| Platform traces enabled             | `false`                                           |
| Existing deployment health endpoint | HTTP `200`, status `ok`, environment `production` |

The health request used the deployment's configured origin. No settings,
credentials, code, routes or stored data were changed by this independent check.
Private settings, health and timestamped readback receipts are under
`temp/lumafoil-production-observability-readback/`; public evidence does not
include resource identifiers or credential values.

The dashboard's off state does not expose individual inactive persistence or
query-redaction fields in the readback. The final release's source configuration
therefore retains explicit `persist: false` for logs/traces and
`redact_query_string: true`, with source and compiled-output regression guards.
Recheck those controls against the final reviewed deployment. The current
readback establishes live platform logging/tracing disablement and basic health;
it does not certify the final build, migrations, domain cutover, account/provider
journeys or administrator diagnostic views. Use synthetic requests and private
evidence for further live checks, never real reset, OAuth, invitation or share
credentials.

This setting does not erase already retained provider records, guarantee that
every Cloudflare infrastructure or account-level diagnostic service stores no
metadata, or sanitize operator exports. Prior records and their access/retention
need separate operator review. Do not re-enable persistent request-context
logging or tracing without new hosted evidence that bearer paths are excluded
before storage, or an architecture that removes that bearer data from the
logged request context.

## Sources

- [Cloudflare Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
  documents separate invocation/custom records and invocation-log disabling.
- [Cloudflare Worker upload API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/update/)
  documents observability, persistence and query-redaction settings.
- The installed `wrangler@4.129.0` `config-schema.json` accepts
  `redact_query_string`, log/tracing enablement and their `persist` settings.
  Hosted readback and dashboard evidence above verify this installed toolchain's
  disabled configuration against the provider.
