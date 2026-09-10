# M19 mobile diagnostic sample - not certification

Scope: selected pages only. Full milestone certification remains open.
Runs per page: 1. Performance and timing use medians; accessibility and best practices use the lowest observed score. Origin storage and HTTP cache are cold for each trace.

| Page | Performance | Accessibility | Best practices | FCP ms | LCP ms | CLS | TBT ms | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/app` | 79 | 100 | 100 | 1606 | 4868 | 0.0000 | 200 | performance: 0.79 < 0.9; lcp: 4867.8862 > 2500; tbt: 200 > 150 |
| `/app/library/new` | 73 | 100 | 100 | 2251 | 5184 | 0.0000 | 275 | performance: 0.73 < 0.9; fcp: 2250.8139 > 2200; lcp: 5183.883399999995 > 2500; tbt: 275 > 150 |
| `/app/editor` | 68 | 100 | 100 | 2251 | 6003 | 0.0000 | 351 | performance: 0.68 < 0.9; fcp: 2250.5489 > 2200; lcp: 6003.195599999998 > 2500; tbt: 351 > 150 |
