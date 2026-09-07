import { describe, expect, it } from 'vitest'

import { DEFAULT_NAME_PATTERN, resolveNamePattern, type NameContext } from './names'

const CONTEXT: NameContext = {
  name: 'holiday',
  index: 3,
  count: 120,
  date: new Date(2026, 6, 15),
  preset: 'Studio Signature',
  width: 1200,
  height: 900,
}

describe('resolveNamePattern', () => {
  it('fills every token, zero-padding the index to the batch digit count', () => {
    const pattern = '{index}-{name}-{preset}-{date}-{width}x{height}-{count}'
    expect(resolveNamePattern(pattern, CONTEXT)).toBe(
      '003-holiday-studio-signature-2026-07-15-1200x900-120',
    )
  })

  it('applies the default pattern', () => {
    expect(resolveNamePattern(DEFAULT_NAME_PATTERN, CONTEXT)).toBe('holiday-watermarked')
  })

  it('replaces characters outside the safe set with a hyphen', () => {
    expect(resolveNamePattern('a/b:c*{name}', { ...CONTEXT, name: 'x' })).toBe('a-b-c-x')
  })

  it('throws when the pattern resolves to an empty name', () => {
    expect(() => resolveNamePattern(' '.repeat(3), CONTEXT)).toThrow(RangeError)
  })
})
