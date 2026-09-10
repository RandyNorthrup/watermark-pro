# M19 desktop diagnostic sample - not certification

Scope: selected pages only. Full milestone certification remains open.
Runs per page: 1. Performance and timing use medians; accessibility and best practices use the lowest observed score. Origin storage and HTTP cache are cold for each trace.

Transport: HTTP/2 over TLS with an ephemeral key pinned only in the audit browser. Normal hosted TLS and deployment performance remain separate release evidence.

| Page | Performance | Accessibility | Best practices | FCP ms | LCP ms | CLS | TBT ms | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `library` | 100 | 100 | 100 | 542 | 722 | 0.0040 | 0 | Within budgets |
| `invitations` | 100 | 100 | 100 | 401 | 487 | 0.0041 | 0 | Within budgets |
