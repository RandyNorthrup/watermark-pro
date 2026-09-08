import { describe, expect, it, vi } from 'vitest'

import handler, { createApp } from './index'
import { apiErrorSchema, healthResponseSchema } from '../shared/api'
import { API_ERROR_CODE, HEALTH_PATH, HTTP_STATUS } from '../shared/constants'
import { createTestEnv, createTestHarness, TEST_APP_URL } from './test-support/test-app'

/** A no-op execution context for calling the default handler's fetch directly. */
const testExecutionContext = {
  waitUntil() {
    // nothing to await in these tests
  },
  passThroughOnException() {
    // never pass through in these tests
  },
} as unknown as ExecutionContext

function silenceConsoleError() {
  return vi.spyOn(console, 'error').mockImplementation(() => {
    // Keep expected error logs out of the test output.
  })
}

describe('GET /api/health', () => {
  it('returns ok with the validated environment', async () => {
    const { app, env } = createTestHarness()
    const response = await app.request(HEALTH_PATH, {}, env)

    expect(response.status).toBe(HTTP_STATUS.ok)
    expect(healthResponseSchema.parse(await response.json())).toEqual({
      status: 'ok',
      environment: 'test',
    })
  })

  it('sets hardened security headers on every response', async () => {
    const { app, env } = createTestHarness()
    const response = await app.request(HEALTH_PATH, {}, env)

    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    expect(response.headers.get('strict-transport-security')).toMatch(
      /^max-age=\d+; includeSubDomains$/,
    )
    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('permissions-policy')).toContain('camera=()')
  })
})

describe('default worker handler', () => {
  it('serves the prerendered landing for GET / ahead of the API app', async () => {
    const env = createTestEnv({
      // A fake ASSETS binding standing in for the prerendered landing store.
      ASSETS: {
        fetch: () =>
          Promise.resolve(
            new Response('<!doctype html><html lang="es"></html>', {
              status: HTTP_STATUS.ok,
              headers: { 'content-type': 'text/html' },
            }),
          ),
      } as unknown as Env['ASSETS'],
    })
    const response = await handler.fetch(new Request(`${TEST_APP_URL}/`), env, testExecutionContext)
    expect(response.status).toBe(HTTP_STATUS.ok)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(await response.text()).toContain('lang="es"')
  })

  it('passes non-root requests through to the API app', async () => {
    const response = await handler.fetch(
      new Request(`${TEST_APP_URL}${HEALTH_PATH}`),
      createTestEnv(),
      testExecutionContext,
    )
    expect(response.status).toBe(HTTP_STATUS.ok)
    expect(healthResponseSchema.parse(await response.json())).toEqual({
      status: 'ok',
      environment: 'test',
    })
  })
})

describe('error handling', () => {
  it('returns a JSON 404 for unknown API routes', async () => {
    const { app, env } = createTestHarness()
    const response = await app.request('/api/does-not-exist', {}, env)

    expect(response.status).toBe(HTTP_STATUS.notFound)
    expect(apiErrorSchema.parse(await response.json())).toEqual({ error: API_ERROR_CODE.notFound })
  })

  it('fails closed with a 500 when the environment is invalid', async () => {
    const consoleError = silenceConsoleError()
    const invalidEnv = createTestEnv({ APP_ENV: 'not-a-real-environment' })

    const response = await createApp().request(HEALTH_PATH, {}, invalidEnv)

    expect(response.status).toBe(HTTP_STATUS.internalServerError)
    expect(apiErrorSchema.parse(await response.json())).toEqual({
      error: API_ERROR_CODE.invalidConfiguration,
    })
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('APP_ENV'))
    consoleError.mockRestore()
  })

  it('rejects cross-origin form posts (CSRF baseline)', async () => {
    const { app, env } = createTestHarness()
    const response = await app.request(
      HEALTH_PATH,
      {
        method: 'POST',
        headers: {
          origin: 'https://evil.example',
          'content-type': 'application/x-www-form-urlencoded',
        },
      },
      env,
    )

    expect(response.status).toBe(HTTP_STATUS.forbidden)
  })

  it('rejects state-changing JSON requests from another origin or with no origin at all', async () => {
    const { app, env } = createTestHarness()
    const statusWith = async (headers: Record<string, string>) => {
      const response = await app.request(
        HEALTH_PATH,
        { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{}' },
        env,
      )
      return response.status
    }
    expect(await statusWith({ origin: 'https://evil.example' })).toBe(HTTP_STATUS.forbidden)
    expect(await statusWith({})).toBe(HTTP_STATUS.forbidden)
    // The app's own origin passes the guard; the health route then answers as usual.
    expect(await statusWith({ origin: TEST_APP_URL })).not.toBe(HTTP_STATUS.forbidden)
  })

  it('converts unexpected exceptions into a JSON 500 without leaking details', async () => {
    const consoleError = silenceConsoleError()
    const { services, env } = createTestHarness()
    const app = createApp({ resolveServices: () => services })
    app.get('/api/boom', () => {
      throw new Error('secret internal detail')
    })

    const response = await app.request('/api/boom', {}, env)

    expect(response.status).toBe(HTTP_STATUS.internalServerError)
    expect(apiErrorSchema.parse(await response.clone().json())).toEqual({
      error: API_ERROR_CODE.internalError,
    })
    expect(await response.text()).not.toContain('secret internal detail')
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
