import assert from 'node:assert/strict'
import { test } from 'node:test'

import { budgetFailures, summarizeRuns } from './lib/lighthouse-budget.mjs'

const sample = {
  scores: { performance: 0.95, accessibility: 1, 'best-practices': 0.95 },
  metrics: { fcp: 1800, lcp: 2500, cls: 0.02, tbt: 150 },
}
test('M19 thresholds accept boundary values and reject each independently regressed metric', () => {
  assert.deepEqual(budgetFailures(sample, 'mobile', false), [])
  for (const metric of ['fcp', 'lcp', 'cls', 'tbt']) {
    assert.ok(
      budgetFailures(
        { ...sample, metrics: { ...sample.metrics, [metric]: sample.metrics[metric] + 1 } },
        'mobile',
        false,
      ).some((message) => message.startsWith(metric)),
    )
  }
  assert.ok(
    budgetFailures(
      { ...sample, scores: { ...sample.scores, accessibility: 0.99 } },
      'desktop',
      false,
    ).some((message) => message.startsWith('accessibility')),
  )
  assert.deepEqual(
    budgetFailures({ ...sample, metrics: { ...sample.metrics, fcp: 2200 } }, 'mobile', true),
    [],
  )
})
test('five traces are required and intermittent accessibility failures cannot be hidden by a median', () => {
  assert.throws(() => summarizeRuns([sample], 5), /Expected 5/)
  const runs = [
    sample,
    sample,
    sample,
    sample,
    {
      ...sample,
      scores: { ...sample.scores, accessibility: 0.99 },
      metrics: { ...sample.metrics, fcp: 9000 },
    },
  ]
  const result = summarizeRuns(runs, 5)
  assert.equal(result.scores.accessibility, 0.99)
  assert.equal(result.metrics.fcp, 1800)
  assert.ok(budgetFailures(result, 'mobile', false).length > 0)
})
