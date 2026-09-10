# M19 mobile diagnostic sample - not certification

Scope: selected pages only. Full milestone certification remains open.
Runs per page: 1. Performance and timing use medians; accessibility and best practices use the lowest observed score. Origin storage and HTTP cache are cold for each trace.

Transport: HTTP/2 over TLS with an ephemeral key pinned only in the audit browser. Normal hosted TLS and deployment performance remain separate release evidence.

| Page | Performance | Accessibility | Best practices | FCP ms | LCP ms | CLS | TBT ms | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `login` | 93 | 100 | 100 | 1170 | 2550 | 0.0000 | 230 | lcp: 2549.654 > 2500; tbt: 230 > 150 |
| `privacy` | 100 | 100 | 100 | 1061 | 1110 | 0.0000 | 0 | Within budgets |
