import { describe, expect, it } from 'vitest'

import { SNIFF_LENGTH, sniffImageType } from './uploads'

function bytes(...values: (number | string)[]): Uint8Array {
  const out: number[] = []
  for (const value of values) {
    if (typeof value === 'number') {
      out.push(value)
    } else {
      out.push(...new TextEncoder().encode(value))
    }
  }
  return new Uint8Array(out)
}

describe('sniffImageType', () => {
  it('recognises the supported signatures from the first bytes only', () => {
    expect(sniffImageType(bytes(0x89, 'PNG\r\n', 0x1a, '\n', 0, 0, 0, 0))).toBe('image/png')
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg')
    expect(sniffImageType(bytes('GIF89a'))).toBe('image/gif')
    expect(sniffImageType(bytes('RIFF', 0, 0, 0, 0, 'WEBPVP8 '))).toBe('image/webp')
    expect(sniffImageType(bytes(0, 0, 0, 0x1c, 'ftypavif'))).toBe('image/avif')
    expect(sniffImageType(bytes(0, 0, 0, 0x1c, 'ftypavis'))).toBe('image/avif')
  })

  it('rejects near misses and non-images', () => {
    expect(sniffImageType(bytes('RIFF', 0, 0, 0, 0, 'WAVEfmt '))).toBeNull()
    expect(sniffImageType(bytes(0, 0, 0, 0x1c, 'ftypisom'))).toBeNull()
    expect(sniffImageType(bytes('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull()
    expect(sniffImageType(new Uint8Array(0))).toBeNull()
    expect(SNIFF_LENGTH).toBeGreaterThanOrEqual('RIFF....WEBP'.length)
  })
})
