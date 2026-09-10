# M19 mobile diagnostic sample - not certification

Scope: selected pages only. Full milestone certification remains open.
Runs per page: 1. Performance and timing use medians; accessibility and best practices use the lowest observed score. Origin storage and HTTP cache are cold for each trace.

Transport: HTTP/2 over TLS with an ephemeral key pinned only in the audit browser. Normal hosted TLS and deployment performance remain separate release evidence.

| Page | Performance | Accessibility | Best practices | FCP ms | LCP ms | CLS | TBT ms | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `login` | 95 | 100 | 100 | 1177 | 2488 | 0.0000 | 161 | tbt: 161 > 150 |
| `invitations` | 96 | 100 | 100 | 1825 | 2390 | 0.0000 | 120 | Within budgets |
