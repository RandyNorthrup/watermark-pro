# M19 mobile certification

Scope: selected pages only. Full milestone certification remains open.
Runs per page: 5. Performance and timing use medians; accessibility and best practices use the lowest observed score. Origin storage and HTTP cache are cold for each trace.

Transport: HTTP/2 over TLS with an ephemeral key pinned only in the audit browser. Normal hosted TLS and deployment performance remain separate release evidence.

| Page | Performance | Accessibility | Best practices | FCP ms | LCP ms | CLS | TBT ms | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `login` | 91 | 100 | 100 | 1651 | 2499 | 0.0000 | 298 | tbt: 298 > 150 |
| `invitations` | 96 | 100 | 100 | 1875 | 2251 | 0.0000 | 110 | Within budgets |
