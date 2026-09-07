import { describe, expect, it } from 'vitest'

import { embedInvisibleMark, invisibleCapacity, readInvisibleMark } from './invisible'

/** A deterministic non-flat RGBA buffer, so blue LSBs start as varied noise. */
function noisyBuffer(width: number, height: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < data.length; index += 1) {
    data[index] = (index * 37 + 11) & 0xff
  }
  return data
}

/** Flips the blue-channel LSB of one pixel in place. */
function flipBlueLsb(data: Uint8ClampedArray, pixelIndex: number): void {
  const index = pixelIndex * 4 + 2
  data[index] = (data[index] ?? 0) ^ 1
}

describe('invisibleCapacity', () => {
  it('subtracts the fixed overhead from the one-bit-per-pixel budget', () => {
    // 16x16 = 256 pixels -> floor(256/8) - 10 = 22 message bytes.
    expect(invisibleCapacity(16, 16)).toBe(22)
  })

  it('caps at the maximum message length for a large grid', () => {
    expect(invisibleCapacity(4000, 3000)).toBe(64)
  })

  it('reports zero for a grid too small to hold even the overhead', () => {
    expect(invisibleCapacity(4, 1)).toBe(0)
  })
})

describe('embedInvisibleMark / readInvisibleMark', () => {
  it('round-trips a message through a noisy buffer', () => {
    const width = 64
    const height = 64
    const data = noisyBuffer(width, height)
    const message = 'Hello, Watermark Pro!'
    embedInvisibleMark(data, width, height, message)
    expect(readInvisibleMark(data, width, height)).toBe(message)
  })

  it('round-trips an empty message', () => {
    const width = 32
    const height = 32
    const data = noisyBuffer(width, height)
    embedInvisibleMark(data, width, height, '')
    expect(readInvisibleMark(data, width, height)).toBe('')
  })

  it('round-trips multibyte UTF-8', () => {
    const width = 32
    const height = 32
    const data = noisyBuffer(width, height)
    const message = 'café ☕ 日本語 — © 2026'
    embedInvisibleMark(data, width, height, message)
    expect(readInvisibleMark(data, width, height)).toBe(message)
  })

  it('returns null when a single embedded bit is flipped (integrity guard)', () => {
    // 16x16 sized so every one of the 256 pixels carries a payload bit.
    const width = 16
    const height = 16
    const message = 'ABCDEFGHIJKLMNOPQRSTUV'
    const data = noisyBuffer(width, height)
    embedInvisibleMark(data, width, height, message)
    expect(readInvisibleMark(data, width, height)).toBe(message)
    flipBlueLsb(data, 200)
    expect(readInvisibleMark(data, width, height)).toBeNull()
  })

  it('finds no mark in an unmarked buffer', () => {
    expect(readInvisibleMark(noisyBuffer(64, 64), 64, 64)).toBeNull()
  })

  it('returns null for a grid too small to hold a header', () => {
    expect(readInvisibleMark(new Uint8ClampedArray(4 * 4), 4, 1)).toBeNull()
  })
})

describe('capacity boundary', () => {
  it('embeds a message exactly at capacity', () => {
    const width = 16
    const height = 16
    const message = 'ABCDEFGHIJKLMNOPQRSTUV'
    expect(message.length).toBe(invisibleCapacity(width, height))
    const data = noisyBuffer(width, height)
    embedInvisibleMark(data, width, height, message)
    expect(readInvisibleMark(data, width, height)).toBe(message)
  })

  it('throws RangeError for a message one byte over capacity', () => {
    const width = 16
    const height = 16
    const message = 'ABCDEFGHIJKLMNOPQRSTUVW'
    expect(message.length).toBe(invisibleCapacity(width, height) + 1)
    expect(() => {
      embedInvisibleMark(noisyBuffer(width, height), width, height, message)
    }).toThrow(RangeError)
  })

  it('throws RangeError even for an empty message when the overhead cannot fit', () => {
    expect(() => {
      embedInvisibleMark(new Uint8ClampedArray(4 * 4), 4, 1, '')
    }).toThrow(RangeError)
  })
})
