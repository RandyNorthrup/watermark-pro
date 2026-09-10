# M19 mobile diagnostic sample - not certification

Scope: selected pages only. Full milestone certification remains open.
Runs per page: 1. Performance and timing use medians; accessibility and best practices use the lowest observed score. Origin storage and HTTP cache are cold for each trace.

Transport: HTTP/2 over TLS with an ephemeral key pinned only in the audit browser. Normal hosted TLS and deployment performance remain separate release evidence.

| Page | Performance | Accessibility | Best practices | FCP ms | LCP ms | CLS | TBT ms | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `home` | 100 | 100 | 100 | 947 | 1397 | 0.0000 | 0 | Within budgets |
| `dashboard` | 84 | 100 | 100 | 1323 | 2823 | 0.1028 | 373 | performance: 0.84 < 0.9; cls: 0.10276722730160806 > 0.02; lcp: 2822.7925999999998 > 2500; tbt: 372.5 > 150 |
