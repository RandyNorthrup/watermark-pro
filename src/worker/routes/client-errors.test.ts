import { describe, expect, it } from 'vitest'

import { CLIENT_ERROR_MAX_BODY_BYTES, HTTP_STATUS } from '../../shared/constants'
import { createTestHarness, TEST_APP_URL } from '../test-support/test-app'

function post(body: string, headers: Record<string, string> = {}): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: TEST_APP_URL, ...headers },
    body,
  }
}

describe('POST /api/client-errors', () => {
  it('stores a bounded report and answers 204', async () => {
    const { app, env, services } = createTestHarness()
    const response = await app.request(
      '/api/client-errors',
      post(JSON.stringify({ message: 'boom', source: 'at foo (a.js:1:2)', route: '/app/editor' }), {
        'x-request-id': 'req-1',
        'user-agent': 'test-agent',
      }),
      env,
    )
    expect(response.status).toBe(HTTP_STATUS.noContent)

    const stored = await services.observability.listClientErrors()
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({
      message: 'boom',
      source: 'at foo (a.js:1:2)',
      route: '/app/editor',
      userAgent: 'test-agent',
      requestId: 'req-1',
      userId: null,
    })
  })

  it('rejects a report that is missing its message', async () => {
    const { app, env, services } = createTestHarness()
    const response = await app.request(
      '/api/client-errors',
      post(JSON.stringify({ route: '/app' })),
      env,
    )
    expect(response.status).toBe(HTTP_STATUS.badRequest)
    expect(await services.observability.listClientErrors()).toHaveLength(0)
  })

  it('rejects an over-sized body before parsing it', async () => {
    const { app, env, services } = createTestHarness()
    const response = await app.request(
      '/api/client-errors',
      post(JSON.stringify({ message: 'boom' }), {
        'content-length': String(CLIENT_ERROR_MAX_BODY_BYTES + 1),
      }),
      env,
    )
    expect(response.status).toBe(HTTP_STATUS.payloadTooLarge)
    expect(await services.observability.listClientErrors()).toHaveLength(0)
  })

  it('answers 429 and stores nothing when the client is rate limited', async () => {
    const { app, env, services } = createTestHarness({
      rateLimit: { consume: () => Promise.resolve({ allowed: false, retryAfter: 60 }) },
    })
    const response = await app.request(
      '/api/client-errors',
      post(JSON.stringify({ message: 'boom' })),
      env,
    )
    expect(response.status).toBe(HTTP_STATUS.tooManyRequests)
    expect(await services.observability.listClientErrors()).toHaveLength(0)
  })
})
