import { describe, expect, it } from 'vitest'

import { hashIp } from './audit'

describe('hashIp', () => {
  it('is deterministic per secret and does not reveal the address', async () => {
    const first = await hashIp('203.0.113.9', 'secret-a')
    const second = await hashIp('203.0.113.9', 'secret-a')
    const otherSecret = await hashIp('203.0.113.9', 'secret-b')
    const otherIp = await hashIp('203.0.113.10', 'secret-a')

    expect(first).toBe(second)
    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(first).not.toBe(otherSecret)
    expect(first).not.toBe(otherIp)
    expect(first).not.toContain('203')
  })
})
