import assert from 'node:assert/strict'
import { test } from 'node:test'

import { auditContentFailure, withLighthousePage } from './lib/lighthouse-page.mjs'

function fixture(isSameTarget = true) {
  const events = []
  const mirror = { measured: true }
  const session = (id) => ({
    send: async () => ({ targetInfo: { targetId: id } }),
    detach: async () => {
      events.push('detach')
    },
  })
  const page = {
    createCDPSession: async () => session('measured'),
    close: async () => {
      events.push('page-close')
    },
  }
  const drivers = {
    connectPuppeteer: async () => ({
      newPage: async () => page,
      disconnect: async () => {
        events.push('disconnect')
      },
    }),
    connectInspector: async () => ({
      contexts: () => [
        {
          waitForEvent: async () => mirror,
          newCDPSession: async () => session(isSameTarget ? 'measured' : 'other'),
        },
      ],
      close: async () => {
        events.push('inspector-close')
      },
    }),
  }
  return { drivers, page, mirror, events }
}

test('the exact measured page remains open for inspection, then all owned handles close', async () => {
  const state = fixture()
  const result = await withLighthousePage(
    1234,
    async (page, mirror) => {
      assert.equal(page, state.page)
      assert.equal(mirror, state.mirror)
      assert.equal(state.events.includes('page-close'), false)
      state.events.push('content-check')
      return 'measured-result'
    },
    state.drivers,
  )
  assert.equal(result, 'measured-result')
  assert.deepEqual(state.events.slice(-4), [
    'content-check',
    'page-close',
    'inspector-close',
    'disconnect',
  ])
})

test('wrong-target and failed-content checks still close the owned page and connections', async () => {
  const mismatch = fixture(false)
  await assert.rejects(
    withLighthousePage(
      1234,
      () => assert.fail('Wrong target must not be inspected'),
      mismatch.drivers,
    ),
    /does not own the measured target/,
  )
  assert.deepEqual(mismatch.events.slice(-3), ['page-close', 'inspector-close', 'disconnect'])
  const state = fixture()
  await assert.rejects(
    withLighthousePage(
      1234,
      () => {
        throw new Error('Content failure')
      },
      state.drivers,
    ),
    /Content failure/,
  )
  assert.deepEqual(state.events.slice(-3), ['page-close', 'inspector-close', 'disconnect'])
  assert.equal(
    auditContentFailure(new Error('Audit page has an undecoded visible image')),
    'image-decode',
  )
  assert.equal(auditContentFailure(new Error('private page details')), 'inspection-failed')
})
