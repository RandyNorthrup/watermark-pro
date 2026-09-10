# M19 mobile diagnostic sample - not certification

Scope: selected pages only. Full milestone certification remains open.
Runs per page: 1. Performance and timing use medians; accessibility and best practices use the lowest observed score. Origin storage and HTTP cache are cold for each trace.

| Page | Performance | Accessibility | Best practices | FCP ms | LCP ms | CLS | TBT ms | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | 100 | 100 | 100 | 775 | 1375 | 0.0003 | 0 | Within budgets |
| `/app` | 60 | 100 | 100 | 1145 | 5132 | 0.2012 | 458 | performance: 0.6 < 0.9; cls: 0.20117539214246843 > 0.02; lcp: 5131.7624 > 2500; tbt: 458 > 150 |
