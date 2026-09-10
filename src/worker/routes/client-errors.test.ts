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
  it('normalizes direct untrusted reports before storage', async () => {
    const { app, env, services } = createTestHarness()
    const response = await app.request(
      '/api/client-errors',
      post(
        JSON.stringify({
          message: 'PRIVATE_CONTENT_CANARY person@example.test',
          source: 'https://outside.test/share/TOKEN_CANARY?code=CODE_CANARY',
          route: '/app/library/PRIVATE_PRESET_CANARY?code=CODE_CANARY',
        }),
        { 'user-agent': 'PRIVATE_AGENT_CANARY' },
      ),
      env,
    )
    expect(response.status).toBe(HTTP_STATUS.noContent)
    const stored = await services.observability.listClientErrors()
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({
      message: 'Error',
      source: null,
      route: '/app/library/:id',
      userAgent: null,
    })
    for (const sensitive of [
      'PRIVATE_CONTENT_CANARY',
      'person@example.test',
      'TOKEN_CANARY',
      'CODE_CANARY',
      'PRIVATE_PRESET_CANARY',
      'PRIVATE_AGENT_CANARY',
    ])
      expect(JSON.stringify(stored)).not.toContain(sensitive)
  })
  it('stores a bounded report and answers 204', async () => {
    const { app, env, services } = createTestHarness()
    const response = await app.request(
      '/api/client-errors',
      post(
        JSON.stringify({
          message: 'TypeError',
          source: '/assets/app-abc123.js:1:2',
          route: '/app/editor',
        }),
        {
          'x-request-id': 'req-1',
          'user-agent': 'test-agent',
        },
      ),
      env,
    )
    expect(response.status).toBe(HTTP_STATUS.noContent)

    const stored = await services.observability.listClientErrors()
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({
      message: 'TypeError',
      source: '/assets/app-abc123.js:1:2',
      route: '/app/editor',
      userAgent: null,
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

  it.each([{}, { 'content-length': '1' }])(
    'enforces actual bytes when the length is missing or false',
    async (headers) => {
      const { app, env, services } = createTestHarness()
      const body = JSON.stringify({
        message: 'Valid message',
        ignored: 'x'.repeat(CLIENT_ERROR_MAX_BODY_BYTES),
      })
      const response = await app.request('/api/client-errors', post(body, headers), env)
      expect(response.status).toBe(HTTP_STATUS.payloadTooLarge)
      expect(await services.observability.listClientErrors()).toEqual([])
    },
  )

  it('rejects malformed JSON without storing a report', async () => {
    const { app, env, services } = createTestHarness()
    const response = await app.request('/api/client-errors', post('{'), env)
    expect(response.status).toBe(HTTP_STATUS.badRequest)
    expect(await services.observability.listClientErrors()).toEqual([])
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
