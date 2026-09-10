# M19 desktop diagnostic sample - not certification

Scope: selected pages only. Full milestone certification remains open.
Runs per page: 1. Performance and timing use medians; accessibility and best practices use the lowest observed score. Origin storage and HTTP cache are cold for each trace.

Transport: HTTP/2 over TLS with an ephemeral key pinned only in the audit browser. Normal hosted TLS and deployment performance remain separate release evidence.

| Page | Performance | Accessibility | Best practices | FCP ms | LCP ms | CLS | TBT ms | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `library` | 99 | 100 | 100 | 544 | 737 | 0.0297 | 0 | cls: 0.029656090534979418 > 0.02 |
| `invitations` | 99 | 100 | 100 | 401 | 521 | 0.0607 | 0 | cls: 0.060671252302238916 > 0.02 |
