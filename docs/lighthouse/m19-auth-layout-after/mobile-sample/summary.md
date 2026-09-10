# M19 mobile diagnostic sample - not certification

Scope: selected pages only. Full milestone certification remains open.
Runs per page: 1. Performance and timing use medians; accessibility and best practices use the lowest observed score. Origin storage and HTTP cache are cold for each trace.

Transport: HTTP/2 over TLS with an ephemeral key pinned only in the audit browser. Normal hosted TLS and deployment performance remain separate release evidence.

| Page | Performance | Accessibility | Best practices | FCP ms | LCP ms | CLS | TBT ms | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `library` | 96 | 100 | 100 | 1532 | 2555 | 0.0000 | 84 | lcp: 2555.3075 > 2500 |
| `invitations` | 95 | 100 | 100 | 1875 | 2276 | 0.0000 | 164 | tbt: 163.5 > 150 |
