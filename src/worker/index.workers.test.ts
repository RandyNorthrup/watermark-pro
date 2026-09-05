/**
 * Runs inside workerd via @cloudflare/vitest-pool-workers. Exercises the real
 * module entry with the real `env` from wrangler.jsonc (APP_ENV overridden to
 * "test" in vitest.workers.config.ts) so that binding wiring, compatibility
 * flags and the Hono fetch handler are all verified together.
 */
import { env, exports } from 'cloudflare:workers'

import { describe, expect, it } from 'vitest'

import { healthResponseSchema } from '../shared/api'
import { HEALTH_PATH, HTTP_STATUS } from '../shared/constants'

describe('Worker in workerd', () => {
  it('exposes the test environment through the real binding object', () => {
    expect(env.APP_ENV).toBe('test')
  })

  it('serves the health endpoint through the module fetch handler', async () => {
    const response = await exports.default.fetch(
      new Request(`https://watermark-pro.test${HEALTH_PATH}`),
    )

    expect(response.status).toBe(HTTP_STATUS.ok)
    expect(healthResponseSchema.parse(await response.json())).toEqual({
      status: 'ok',
      environment: 'test',
    })
  })
})
