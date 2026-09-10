import assert from 'node:assert/strict'
import { test } from 'node:test'

import { validateAuditNavigation } from './lib/lighthouse-navigation.mjs'

const origin = 'https://localhost:5274'
const document = {
  url: `${origin}/app`,
  resourceType: 'Document',
  statusCode: 200,
  finished: true,
  protocol: 'h2',
}
const asset = { ...document, url: `${origin}/assets/app.js`, resourceType: 'Script' }
const baseline = {
  origin,
  pathname: '/app',
  finalDisplayedUrl: document.url,
  requests: [document, asset],
}

test('audit navigation requires the real successful page and completed same-origin HTTP/2 requests', () => {
  assert.deepEqual(validateAuditNavigation(baseline), ['h2'])
  assert.deepEqual(validateAuditNavigation({ ...baseline, pathname: '/app/' }), ['h2'])
  for (const requests of [undefined, [], [{ ...document, statusCode: 500 }]])
    assert.throws(
      () => validateAuditNavigation({ ...baseline, requests }),
      /expected successful page/,
    )
  for (const target of [`${origin}/login`, 'https://foreign.invalid/app']) {
    assert.throws(
      () =>
        validateAuditNavigation({
          ...baseline,
          finalDisplayedUrl: target,
          requests: [{ ...document, url: target }],
        }),
      /expected successful page/,
    )
  }
  for (const request of [document, asset]) {
    const requests = baseline.requests.map((item) =>
      item === request ? { ...item, protocol: 'http/1.1' } : item,
    )
    assert.throws(
      () => validateAuditNavigation({ ...baseline, requests }),
      /must negotiate HTTP\/2/,
    )
  }
})

test('an API failure invalidates a successful-looking page while unfinished work is not a response', () => {
  for (const statusCode of [0, 403, 500]) {
    assert.throws(
      () =>
        validateAuditNavigation({
          ...baseline,
          requests: [
            ...baseline.requests,
            { ...asset, url: `${origin}/api/me/bootstrap`, statusCode },
          ],
        }),
      /unexpected HTTP error/,
    )
  }
  assert.deepEqual(
    validateAuditNavigation({
      ...baseline,
      requests: [
        ...baseline.requests,
        { ...asset, url: `${origin}/background.bin`, statusCode: 0, finished: false },
      ],
    }),
    ['h2'],
  )
})

test('in-memory blob images are valid resources without an HTTP transport protocol', () => {
  assert.deepEqual(
    validateAuditNavigation({
      ...baseline,
      requests: [
        ...baseline.requests,
        {
          ...asset,
          url: `blob:${origin}/saved-photo`,
          resourceType: 'Image',
          protocol: 'blob',
        },
      ],
    }),
    ['h2'],
  )
})
