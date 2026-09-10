/** M19 release targets. Diagnostics use the same thresholds and are labelled separately from certification. */
export const LIGHTHOUSE_RUNS_PER_PAGE = 5
export const LIGHTHOUSE_BUDGETS = {
  desktop: { performance: 0.95, accessibility: 1, 'best-practices': 0.95 },
  mobile: { performance: 0.9, accessibility: 1, 'best-practices': 0.95 },
}
export const LIGHTHOUSE_METRICS = {
  fcp: 'first-contentful-paint',
  lcp: 'largest-contentful-paint',
  cls: 'cumulative-layout-shift',
  tbt: 'total-blocking-time',
}

export function median(values) {
  if (values.length === 0 || values.some((value) => !Number.isFinite(value)))
    throw new Error('A median needs finite samples.')
  const sorted = values.toSorted((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

export function summarizeRuns(runs, expectedCount) {
  if (runs.length !== expectedCount)
    throw new Error(`Expected ${expectedCount} valid Lighthouse traces; received ${runs.length}.`)
  const scores = Object.fromEntries(
    Object.keys(LIGHTHOUSE_BUDGETS.desktop).map((key) => [
      key,
      key === 'performance'
        ? median(runs.map((run) => run.scores[key]))
        : Math.min(...runs.map((run) => run.scores[key])),
    ]),
  )
  const metrics = Object.fromEntries(
    Object.keys(LIGHTHOUSE_METRICS).map((key) => [
      key,
      median(runs.map((run) => run.metrics[key])),
    ]),
  )
  return { scores, metrics }
}

export function budgetFailures(result, formFactor, isAuthenticated) {
  const failures = []
  const minimums = Object.entries(LIGHTHOUSE_BUDGETS[formFactor])
  for (const [key, minimum] of minimums) {
    if (!Number.isFinite(result.scores[key]) || result.scores[key] < minimum)
      failures.push(`${key}: ${result.scores[key]} < ${minimum}`)
  }
  const maxima = {
    cls: 0.02,
    ...(formFactor === 'mobile' && { fcp: isAuthenticated ? 2200 : 1800, lcp: 2500, tbt: 150 }),
  }
  for (const [key, maximum] of Object.entries(maxima)) {
    if (!Number.isFinite(result.metrics[key]) || result.metrics[key] > maximum)
      failures.push(`${key}: ${result.metrics[key]} > ${maximum}`)
  }
  return failures
}
