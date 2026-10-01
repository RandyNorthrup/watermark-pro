import assert from 'node:assert/strict'
import { test } from 'node:test'

import { scannerFailureReason } from './lib/scanner-result.mjs'

test('only completed clean/finding scans proceed; timeout, execution, signal and invalid exits fail', () => {
  const completed = { status: 0, signal: null, stdout: 'private-output', stderr: 'private-error' }
  assert.equal(scannerFailureReason(completed), null)
  assert.equal(scannerFailureReason({ ...completed, status: 1 }), null)
  assert.equal(scannerFailureReason({ ...completed, error: { code: 'ETIMEDOUT' } }), 'timeout')
  assert.equal(scannerFailureReason({ ...completed, error: { code: 'ENOENT' } }), 'execution')
  assert.equal(scannerFailureReason({ ...completed, signal: 'SIGTERM' }), 'signal')
  for (const status of [null, 2, -1])
    assert.equal(scannerFailureReason({ ...completed, status }), 'exit')
})
