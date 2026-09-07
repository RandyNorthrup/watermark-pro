import { describe, expect, it } from 'vitest'

import { DEFAULT_NAME_PATTERN } from './names'
import { bulkOutputSize, bulkTransform, extensionFor, type BulkSettings } from './processor'
import { FILTER_BY_ID, IDENTITY_ADJUSTMENTS } from '../../shared/adjustments'

const BASE: BulkSettings = {
  output: { format: 'image/jpeg', quality: 0.9, metadata: 'strip' },
  fitLongestSide: null,
  orientation: { turns: 0, flipX: false, flipY: false },
  adjust: IDENTITY_ADJUSTMENTS,
  border: null,
  namePattern: DEFAULT_NAME_PATTERN,
  presetName: 'Preset',
}

describe('bulkTransform', () => {
  it('is undefined when nothing changes the photo', () => {
    expect(bulkTransform({ width: 400, height: 300 }, BASE)).toBeUndefined()
  })

  it('carries orientation, resize, adjustments and a frame', () => {
    const transform = bulkTransform(
      { width: 400, height: 300 },
      {
        ...BASE,
        orientation: { turns: 1, flipX: false, flipY: false },
        fitLongestSide: 200,
        adjust: FILTER_BY_ID.sepia.adjust,
        border: { width: 0.05, colour: '#ffffff' },
      },
    )
    expect(transform?.orientation).toEqual({ turns: 1, flipX: false, flipY: false, straighten: 0 })
    expect(transform?.resize).toEqual({ width: 150, height: 200 })
    expect(transform?.adjust).toEqual(FILTER_BY_ID.sepia.adjust)
    expect(transform?.border).toEqual({ width: 0.05, colour: '#ffffff' })
  })
})

describe('bulkOutputSize', () => {
  it('applies the long-edge fit and adds the frame', () => {
    const size = bulkOutputSize(
      { width: 4000, height: 3000 },
      { ...BASE, fitLongestSide: 2000, border: { width: 0.1, colour: '#000000' } },
    )
    // 2000×1500 fit, then a 150 px border on each side.
    expect(size).toEqual({ width: 2000 + 300, height: 1500 + 300 })
  })

  it('keeps the source size when nothing resizes it', () => {
    expect(bulkOutputSize({ width: 800, height: 600 }, BASE)).toEqual({ width: 800, height: 600 })
  })
})

describe('extensionFor', () => {
  it('maps each output format', () => {
    expect(extensionFor('image/png')).toBe('png')
    expect(extensionFor('image/jpeg')).toBe('jpg')
    expect(extensionFor('image/webp')).toBe('webp')
  })
})
