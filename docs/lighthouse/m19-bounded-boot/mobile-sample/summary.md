# M19 mobile diagnostic sample - not certification

Scope: selected pages only. Full milestone certification remains open.
Runs per page: 1. Performance and timing use medians; accessibility and best practices use the lowest observed score. Origin storage and HTTP cache are cold for each trace.

| Page | Performance | Accessibility | Best practices | FCP ms | LCP ms | CLS | TBT ms | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/app` | 77 | 100 | 100 | 1237 | 4791 | 0.0000 | 281 | performance: 0.77 < 0.9; lcp: 4790.7045 > 2500; tbt: 280.99999999999955 > 150 |
| `/app/library/new` | 71 | 100 | 100 | 1801 | 5423 | 0.0000 | 357 | performance: 0.71 < 0.9; lcp: 5422.646549999999 > 2500; tbt: 357 > 150 |
| `/app/editor` | 69 | 100 | 100 | 1801 | 5855 | 0.0000 | 351 | performance: 0.69 < 0.9; lcp: 5854.703699999992 > 2500; tbt: 351.0000000000018 > 150 |
