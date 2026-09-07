import { describe, expect, it } from 'vitest'

import { hashString, mulberry32, seedFor } from './random'

function file(name: string, size: number, lastModified: number): File {
  const blob = new File([new Uint8Array(size)], name, { type: 'image/jpeg' })
  Object.defineProperty(blob, 'lastModified', { value: lastModified })
  return blob
}

describe('mulberry32', () => {
  it('is deterministic for a seed and returns values in [0, 1)', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const first = [a(), a(), a()]
    expect([b(), b(), b()]).toEqual(first)
    for (const value of first) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
    // Different seeds diverge.
    expect(mulberry32(43)()).not.toBe(first[0])
  })
})

describe('seedFor', () => {
  it('is stable for one file and differs when name, size or time change', () => {
    const base = file('a.jpg', 1000, 5)
    expect(seedFor(base)).toBe(seedFor(file('a.jpg', 1000, 5)))
    expect(seedFor(base)).not.toBe(seedFor(file('b.jpg', 1000, 5)))
    expect(seedFor(base)).not.toBe(seedFor(file('a.jpg', 1001, 5)))
    expect(seedFor(base)).not.toBe(seedFor(file('a.jpg', 1000, 6)))
  })

  it('hashes to an unsigned 32-bit integer', () => {
    const hash = hashString('watermark')
    expect(Number.isSafeInteger(hash)).toBe(true)
    expect(hash).toBeGreaterThanOrEqual(0)
    expect(hash).toBeLessThan(2 ** 32)
  })
})
