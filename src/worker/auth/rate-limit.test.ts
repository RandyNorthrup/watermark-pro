import { describe, expect, it, vi } from 'vitest'

import { createBindingRateLimitStorage, unlimitedRateLimitStorage } from './rate-limit'

function fakeLimiter(isAllowed: boolean) {
  return { limit: vi.fn(() => Promise.resolve({ success: isAllowed })) }
}

const rule = { window: 10, max: 100 }

describe('createBindingRateLimitStorage', () => {
  it('sends credential endpoints to the strict limiter', async () => {
    const strict = fakeLimiter(true)
    const general = fakeLimiter(true)
    const storage = createBindingRateLimitStorage(strict, general)

    await storage.consume('203.0.113.9|/sign-in/email', rule)

    expect(strict.limit).toHaveBeenCalledWith({ key: '203.0.113.9|/sign-in/email' })
    expect(general.limit).not.toHaveBeenCalled()
  })

  it('sends everything else to the general limiter', async () => {
    const strict = fakeLimiter(true)
    const general = fakeLimiter(true)
    const storage = createBindingRateLimitStorage(strict, general)

    const result = await storage.consume('203.0.113.9|/get-session', rule)

    expect(result).toEqual({ allowed: true, retryAfter: null })
    expect(general.limit).toHaveBeenCalledOnce()
    expect(strict.limit).not.toHaveBeenCalled()
  })

  it('reports a retry window when the binding rejects', async () => {
    const storage = createBindingRateLimitStorage(fakeLimiter(false), fakeLimiter(true))

    const result = await storage.consume('203.0.113.9|/sign-up/email', rule)

    expect(result.allowed).toBe(false)
    expect(result.retryAfter).toBeGreaterThanOrEqual(rule.window)
  })
})

describe('unlimitedRateLimitStorage', () => {
  it('always allows', async () => {
    await expect(unlimitedRateLimitStorage.consume('x|/y', rule)).resolves.toEqual({
      allowed: true,
      retryAfter: null,
    })
  })
})
