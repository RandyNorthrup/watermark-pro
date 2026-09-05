import { describe, expect, it, vi } from 'vitest'

import { createApp } from './index'
import { apiErrorSchema, healthResponseSchema } from '../shared/api'
import { API_ERROR_CODE, HEALTH_PATH, HTTP_STATUS } from '../shared/constants'

const validEnv: Env = { APP_ENV: 'test' }

function silenceConsoleError() {
  return vi.spyOn(console, 'error').mockImplementation(() => {
    // Keep expected error logs out of the test output.
  })
}

describe('GET /api/health', () => {
  it('returns ok with the validated environment', async () => {
    const response = await createApp().request(HEALTH_PATH, {}, validEnv)

    expect(response.status).toBe(HTTP_STATUS.ok)
    expect(healthResponseSchema.parse(await response.json())).toEqual({
      status: 'ok',
      environment: 'test',
    })
  })

  it('sets hardened security headers on every response', async () => {
    const response = await createApp().request(HEALTH_PATH, {}, validEnv)

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

describe('error handling', () => {
  it('returns a JSON 404 for unknown API routes', async () => {
    const response = await createApp().request('/api/does-not-exist', {}, validEnv)

    expect(response.status).toBe(HTTP_STATUS.notFound)
    expect(apiErrorSchema.parse(await response.json())).toEqual({ error: API_ERROR_CODE.notFound })
  })

  it('fails closed with a 500 when the environment is invalid', async () => {
    const consoleError = silenceConsoleError()
    const invalidEnv: Env = { APP_ENV: 'not-a-real-environment' }

    const response = await createApp().request(HEALTH_PATH, {}, invalidEnv)

    expect(response.status).toBe(HTTP_STATUS.internalServerError)
    expect(apiErrorSchema.parse(await response.json())).toEqual({
      error: API_ERROR_CODE.invalidConfiguration,
    })
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('APP_ENV'))
    consoleError.mockRestore()
  })

  it('rejects cross-origin state-changing requests (CSRF baseline)', async () => {
    const response = await createApp().request(
      HEALTH_PATH,
      {
        method: 'POST',
        headers: {
          origin: 'https://evil.example',
          'content-type': 'application/x-www-form-urlencoded',
        },
      },
      validEnv,
    )

    expect(response.status).toBe(HTTP_STATUS.forbidden)
  })

  it('converts unexpected exceptions into a JSON 500 without leaking details', async () => {
    const consoleError = silenceConsoleError()
    const app = createApp()
    app.get('/api/boom', () => {
      throw new Error('secret internal detail')
    })

    const response = await app.request('/api/boom', {}, validEnv)

    expect(response.status).toBe(HTTP_STATUS.internalServerError)
    expect(apiErrorSchema.parse(await response.clone().json())).toEqual({
      error: API_ERROR_CODE.internalError,
    })
    expect(await response.text()).not.toContain('secret internal detail')
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
