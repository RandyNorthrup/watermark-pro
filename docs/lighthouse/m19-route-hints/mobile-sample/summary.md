# M19 mobile diagnostic sample - not certification

Scope: selected pages only. Full milestone certification remains open.
Runs per page: 1. Performance and timing use medians; accessibility and best practices use the lowest observed score. Origin storage and HTTP cache are cold for each trace.

| Page | Performance | Accessibility | Best practices | FCP ms | LCP ms | CLS | TBT ms | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/app` | 78 | 100 | 100 | 1351 | 4827 | 0.0000 | 225 | performance: 0.78 < 0.9; lcp: 4827.351500000002 > 2500; tbt: 225 > 150 |
| `/app/library/new` | 70 | 100 | 100 | 3015 | 5435 | 0.0000 | 238 | performance: 0.7 < 0.9; fcp: 3015 > 2200; lcp: 5435 > 2500; tbt: 238 > 150 |
| `/app/editor` | 65 | 100 | 100 | 2477 | 5676 | 0.0000 | 448 | performance: 0.65 < 0.9; fcp: 2476.6453500000002 > 2200; lcp: 5676.323650000004 > 2500; tbt: 448.0000000000009 > 150 |
