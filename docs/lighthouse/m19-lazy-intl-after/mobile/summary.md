# M19 mobile provisional audit - concurrent workload

Scope: selected pages only. Full milestone certification remains open.
Runs per page: 5. Performance and timing use medians; accessibility and best practices use the lowest observed score. Origin storage and HTTP cache are cold for each trace.

Transport: HTTP/2 over TLS with an ephemeral key pinned only in the audit browser. Normal hosted TLS and deployment performance remain separate release evidence.

| Page | Performance | Accessibility | Best practices | FCP ms | LCP ms | CLS | TBT ms | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/app` | 90 | 100 | 100 | 1801 | 2627 | 0.0000 | 283 | lcp: 2627.1444 > 2500; tbt: 282.5 > 150 |

Validity: provisional only. Concurrent SAST began at2026-09-10 04:55:16UTC and overlapped the final seven seconds; preceding small tests also overlapped. Raw scores are retained, but this aggregate cannot certify performance.
