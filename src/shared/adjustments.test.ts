import { describe, expect, it } from 'vitest'

import {
  type Adjustments,
  adjustmentsSchema,
  FILTER_BY_ID,
  FILTERS,
  filterFor,
  IDENTITY_ADJUSTMENTS,
  IDENTITY_ORIENTATION,
  isIdentityAdjustments,
  isIdentityOrientation,
  orientationSchema,
} from './adjustments'

describe('adjustment schemas', () => {
  it('bounds every channel', () => {
    expect(adjustmentsSchema.safeParse(IDENTITY_ADJUSTMENTS).success).toBe(true)
    expect(adjustmentsSchema.safeParse({ ...IDENTITY_ADJUSTMENTS, brightness: 1.5 }).success).toBe(
      false,
    )
    expect(adjustmentsSchema.safeParse({ ...IDENTITY_ADJUSTMENTS, saturation: -2 }).success).toBe(
      false,
    )
    expect(adjustmentsSchema.safeParse({ ...IDENTITY_ADJUSTMENTS, sepia: -0.1 }).success).toBe(
      false,
    )
    expect(adjustmentsSchema.safeParse({ ...IDENTITY_ADJUSTMENTS, vignette: 1.1 }).success).toBe(
      false,
    )
  })

  it('bounds orientation', () => {
    expect(orientationSchema.safeParse(IDENTITY_ORIENTATION).success).toBe(true)
    expect(orientationSchema.safeParse({ ...IDENTITY_ORIENTATION, turns: 4 }).success).toBe(false)
    expect(orientationSchema.safeParse({ ...IDENTITY_ORIENTATION, straighten: 50 }).success).toBe(
      false,
    )
    expect(orientationSchema.safeParse({ ...IDENTITY_ORIENTATION, straighten: -45 }).success).toBe(
      true,
    )
  })
})

describe('identity helpers', () => {
  it('recognises the identities', () => {
    expect(isIdentityAdjustments(IDENTITY_ADJUSTMENTS)).toBe(true)
    expect(isIdentityAdjustments({ ...IDENTITY_ADJUSTMENTS, contrast: 0.01 })).toBe(false)
    expect(isIdentityOrientation(IDENTITY_ORIENTATION)).toBe(true)
    expect(isIdentityOrientation({ ...IDENTITY_ORIENTATION, turns: 1 })).toBe(false)
    expect(isIdentityOrientation({ ...IDENTITY_ORIENTATION, flipX: true })).toBe(false)
    expect(isIdentityOrientation({ ...IDENTITY_ORIENTATION, straighten: 0.1 })).toBe(false)
  })
})

describe('filter values', () => {
  it('holds the documented look for each named filter', () => {
    expect(FILTER_BY_ID.vivid.adjust).toEqual({
      brightness: 0,
      contrast: 0.15,
      saturation: 0.35,
      warmth: 0,
      sepia: 0,
      vignette: 0,
    })
    expect(FILTER_BY_ID.noir.adjust).toEqual({
      brightness: -0.05,
      contrast: 0.35,
      saturation: -1,
      warmth: 0,
      sepia: 0,
      vignette: 0.5,
    })
    expect(FILTER_BY_ID.original.adjust).toEqual(IDENTITY_ADJUSTMENTS)
  })
})

describe('filterFor', () => {
  it('round-trips every filter and reports a nudge as custom', () => {
    for (const entry of FILTERS) {
      expect(filterFor(entry.adjust)).toBe(entry.id)
    }
    const nudged: Adjustments = { ...FILTER_BY_ID.vivid.adjust, saturation: 0.36 }
    expect(filterFor(nudged)).toBe('custom')
    expect(filterFor(IDENTITY_ADJUSTMENTS)).toBe('original')
  })
})
