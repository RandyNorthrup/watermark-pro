# Benchmarks

Measured with `npm run test:browser` (`src/client/engine/benchmark.browser.test.ts`)
in headless Chromium on the development machine. Re-run and append a row when
the engine changes.

## Watermark engine throughput

Synthetic 4000×3000 image (gradient plus a bright disc), text mark with
smart placement and auto contrast, JPEG output at quality 0.9.

| Date       | Machine                             | Single worker | Pooled                   | Budget (PLAN.md §5.5) |
| ---------- | ----------------------------------- | ------------- | ------------------------ | --------------------- |
| 2026-09-06 | Windows 11, Chromium headless shell | 0.15 s/image  | 8 workers: 22.8 images/s | ≥ 2 images/s          |
