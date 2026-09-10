# M19 mobile diagnostic sample - not certification

Scope: selected pages only. Full milestone certification remains open.
Runs per page: 1. Performance and timing use medians; accessibility and best practices use the lowest observed score. Origin storage and HTTP cache are cold for each trace.

| Page | Performance | Accessibility | Best practices | FCP ms | LCP ms | CLS | TBT ms | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/app` | 80 | 100 | 100 | 1235 | 4652 | 0.0000 | 213 | performance: 0.8 < 0.9; lcp: 4651.822399999998 > 2500; tbt: 213.00000000000045 > 150 |
| `/app/library/new` | 62 | 100 | 100 | 1802 | 5473 | 0.0000 | 665 | performance: 0.62 < 0.9; lcp: 5472.524000000002 > 2500; tbt: 665.0000000000009 > 150 |
| `/app/editor` | 59 | 100 | 100 | 1801 | 6210 | 0.0000 | 706 | performance: 0.59 < 0.9; lcp: 6210.390200000005 > 2500; tbt: 706 > 150 |
