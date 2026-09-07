import { afterEach, describe, expect, it, vi } from 'vitest'

import { isCaptureSupported } from './capture'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** A minimal `matchMedia` that reports the given match for every query. */
function stubMatchMedia(isMatch: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: isMatch, media: query })),
  )
}

describe('isCaptureSupported', () => {
  it('is false when matchMedia is unavailable', () => {
    expect(typeof window.matchMedia).toBe('undefined')
    expect(isCaptureSupported()).toBe(false)
  })

  it('is true for a coarse pointer', () => {
    stubMatchMedia(true)
    expect(isCaptureSupported()).toBe(true)
  })

  it('is false for a fine pointer', () => {
    stubMatchMedia(false)
    expect(isCaptureSupported()).toBe(false)
  })
})
