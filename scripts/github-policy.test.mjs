import assert from 'node:assert/strict'
import { test } from 'node:test'

import { policyMismatches } from './lib/github-policy.mjs'

test('readback allows GitHub metadata and rule ordering without losing controls', () => {
  const expected = {
    bypass_actors: [],
    rules: [
      { type: 'deletion' },
      { type: 'pull_request', parameters: { required_approving_review_count: 0 } },
    ],
  }
  const actual = {
    id: 1,
    bypass_actors: [],
    rules: [
      { type: 'pull_request', parameters: { required_approving_review_count: 0, extra: true } },
      { type: 'deletion' },
    ],
  }
  assert.deepEqual(policyMismatches(expected, actual), [])
  assert.deepEqual(
    policyMismatches(expected, { ...actual, bypass_actors: [{ actor_type: 'RepositoryRole' }] }),
    ['policy.bypass_actors'],
  )
})

test('missing, duplicated, mistyped and weakened controls fail without echoing API values', () => {
  const expected = {
    enabled: true,
    permission: 'read',
    rules: [{ type: 'deletion' }, { type: 'non_fast_forward' }],
  }
  assert.deepEqual(policyMismatches(expected, { ...expected, enabled: false }), ['policy.enabled'])
  assert.deepEqual(policyMismatches(expected, { ...expected, permission: 'private-value' }), [
    'policy.permission',
  ])
  assert.deepEqual(policyMismatches(expected, { ...expected, enabled: 'true' }), ['policy.enabled'])
  assert.deepEqual(
    policyMismatches(expected, {
      ...expected,
      rules: [{ type: 'deletion' }, { type: 'deletion' }],
    }),
    ['policy.rules'],
  )
  assert.deepEqual(policyMismatches(expected, { ...expected, rules: [{ type: 'deletion' }] }), [
    'policy.rules',
  ])
  for (const actual of [null, undefined, [], true])
    assert.deepEqual(policyMismatches(expected, actual), ['policy'])
  assert.deepEqual(policyMismatches([], {}), ['policy'])
  assert.deepEqual(policyMismatches({ enabled: true }, {}), ['policy.enabled'])
})
