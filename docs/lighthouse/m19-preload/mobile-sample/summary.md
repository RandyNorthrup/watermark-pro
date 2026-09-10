# M19 mobile diagnostic sample - not certification

Scope: selected pages only. Full milestone certification remains open.
Runs per page: 1. Performance and timing use medians; accessibility and best practices use the lowest observed score. Origin storage and HTTP cache are cold for each trace.

| Page | Performance | Accessibility | Best practices | FCP ms | LCP ms | CLS | TBT ms | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/app` | 78 | 100 | 100 | 1243 | 4753 | 0.0000 | 262 | performance: 0.78 < 0.9; lcp: 4752.570399999995 > 2500; tbt: 262 > 150 |
| `/app/library/new` | 66 | 100 | 100 | 1801 | 5344 | 0.0000 | 531 | performance: 0.66 < 0.9; lcp: 5343.942800000001 > 2500; tbt: 530.5 > 150 |
| `/app/editor` | 62 | 100 | 100 | 1801 | 6096 | 0.0007 | 592 | performance: 0.62 < 0.9; lcp: 6095.713 > 2500; tbt: 592 > 150 |
