# M19 mobile diagnostic sample - not certification

Scope: selected pages only. Full milestone certification remains open.
Runs per page: 1. Performance and timing use medians; accessibility and best practices use the lowest observed score. Origin storage and HTTP cache are cold for each trace.

| Page | Performance | Accessibility | Best practices | FCP ms | LCP ms | CLS | TBT ms | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/app/library/new` | 68 | 100 | 100 | 1541 | 5826 | 0.0000 | 409 | performance: 0.68 < 0.9; lcp: 5826.0386 > 2500; tbt: 409 > 150 |
| `/app/editor` | 64 | 100 | 100 | 2251 | 6236 | 0.0000 | 462 | performance: 0.64 < 0.9; fcp: 2251.1195 > 2200; lcp: 6235.717000000002 > 2500; tbt: 462 > 150 |
