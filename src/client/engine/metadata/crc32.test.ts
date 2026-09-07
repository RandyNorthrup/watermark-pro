import { describe, expect, it } from 'vitest'

import { crc32 } from './crc32'

describe('crc32', () => {
  it('matches the canonical check value for "123456789"', () => {
    const bytes = new TextEncoder().encode('123456789')
    expect(crc32(bytes)).toBe(0xcb_f4_39_26)
  })

  it('is zero for empty input and unsigned for all inputs', () => {
    expect(crc32(new Uint8Array())).toBe(0)
    const crc = crc32(new Uint8Array([0xff, 0x00, 0x80, 0x7f]))
    expect(crc).toBeGreaterThanOrEqual(0)
    expect(crc).toBeLessThan(2 ** 32)
  })
})
