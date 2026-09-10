# Red-drill manifest reconciliation

Static verification on 2026-09-10 (UTC): all **93** entries in
`scripts/red-drills.mjs` have a nonempty `find` fragment occurring exactly once
in the current target file. The inventory includes four Playwright journeys.
This is manifest readiness, **not execution of the 93 drills** or a claim that
their mutations have all been killed on this source revision.

Four stale entries were updated against their authoritative implementations and
existing positive/negative tests:

| Entry                  | Current mutation                                                                   | Runner and relevant assertion                                                                                                                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform administrator | Invert the combined administrator-role and anchored-owner check.                   | `unit-worker`, `src/worker/admin.test.ts`: ordinary accounts receive 403; the anchored administrator receives successful results.                                                                                     |
| Declared request size  | Double the declared-size threshold in the shared API body-limit middleware.        | `unit-worker`, `src/worker/middleware/body-limit.test.ts`: a declaration one byte above the limit receives 413 before account creation, even when the actual body is small.                                           |
| Photo count quota      | Permit one extra photo reservation in the atomic D1 admission threshold.           | `workers`, `src/worker/uploads.workers.test.ts`: four concurrent attempts at the final photo slot yield exactly one reservation and three quota refusals. The ordinary Node route test cannot prove this D1 boundary. |
| iPhone menu            | Give the phone menu trigger its description translation instead of its menu label. | Playwright `iphone`, `e2e/library.spec.ts`: the shared navigation helper locates the accessible Menu button to reach the library on a narrow viewport.                                                                |

All four replacement sources were constructed and parsed in memory with the
installed TypeScript compiler; they produced zero syntax diagnostics. Their
named runner files exist. Strict manifest ESLint and Prettier checks passed.
No product file was changed by this reconciliation, and no mutation runner,
browser, server, or build was started.

Ignored local receipts are `temp/lumafoil-drill-inventory.json` and
`temp/lumafoil-drill-manifest-syntax.log`. Both explicitly record
`executed: false`. Full red/restored-green execution remains a separate release
gate; earlier dated drill results retain their original scope.
