import { describe, expect, it } from 'vitest'

import {
  ASPECT_PRESETS,
  clampCrop,
  CROP_HANDLES,
  cropForRatio,
  croppedSize,
  fitLongestSide,
  fullCrop,
  isSameSize,
  MAX_OUTPUT_SIDE,
  MIN_CROP_SIDE,
  moveCrop,
  resizeCrop,
  resizeFree,
  resizeLocked,
  resolveRatio,
  scaleSize,
} from './geometry'

const source = { width: 1200, height: 800 }

function aspectOf(rect: { width: number; height: number }): number {
  return rect.width / rect.height
}

describe('crop rectangles', () => {
  it('clamps into the photo, shrinking before moving', () => {
    expect(clampCrop({ x: -50, y: -50, width: 300, height: 200 }, source)).toEqual({
      x: 0,
      y: 0,
      width: 300,
      height: 200,
    })
    expect(clampCrop({ x: 1100, y: 700, width: 300, height: 200 }, source)).toEqual({
      x: 900,
      y: 600,
      width: 300,
      height: 200,
    })
    expect(clampCrop({ x: 0, y: 0, width: 5000, height: 3 }, source)).toEqual({
      x: 0,
      y: 0,
      width: 1200,
      height: MIN_CROP_SIDE,
    })
    expect(clampCrop({ x: 10.4, y: 10.6, width: 100.2, height: 99.5 }, source)).toEqual({
      x: 10,
      y: 11,
      width: 100,
      height: 100,
    })
  })

  it('builds the largest centred rectangle for a preset ratio', () => {
    expect(cropForRatio(source, null)).toEqual(fullCrop(source))
    const square = cropForRatio(source, 1)
    expect(square).toEqual({ x: 200, y: 0, width: 800, height: 800 })
    const tall = cropForRatio(source, 9 / 16)
    expect(aspectOf(tall)).toBeCloseTo(9 / 16, 2)
    expect(tall.height).toBe(800)
    const wide = cropForRatio(source, 3)
    expect(wide.width).toBe(1200)
    expect(wide.height).toBe(400)
    const aroundCorner = cropForRatio(source, 1, { x: 0, y: 0, width: 100, height: 100 })
    expect(aroundCorner).toEqual({ x: 0, y: 0, width: 800, height: 800 })
    expect(cropForRatio(source, null, { x: -5, y: 0, width: 100, height: 100 })).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    })
  })

  it('resolves preset ratios including the original aspect', () => {
    const original = ASPECT_PRESETS.find((preset) => preset.id === 'original')
    const free = ASPECT_PRESETS.find((preset) => preset.id === 'free')
    const square = ASPECT_PRESETS.find((preset) => preset.id === 'square')
    expect(original && resolveRatio(original, source)).toBeCloseTo(1.5)
    expect(free && resolveRatio(free, source)).toBeNull()
    expect(square && resolveRatio(square, source)).toBe(1)
  })

  it('moves without leaving the photo', () => {
    const rect = { x: 100, y: 100, width: 200, height: 100 }
    expect(moveCrop(rect, 50, -20, source)).toEqual({ x: 150, y: 80, width: 200, height: 100 })
    expect(moveCrop(rect, 5000, 5000, source)).toEqual({
      x: 1000,
      y: 700,
      width: 200,
      height: 100,
    })
  })

  it('drags each handle freely and respects the minimum size', () => {
    const rect = { x: 100, y: 100, width: 200, height: 100 }
    expect(resizeCrop(rect, 'se', 50, 25, null, source)).toEqual({
      x: 100,
      y: 100,
      width: 250,
      height: 125,
    })
    expect(resizeCrop(rect, 'nw', -50, -50, null, source)).toEqual({
      x: 50,
      y: 50,
      width: 250,
      height: 150,
    })
    expect(resizeCrop(rect, 'n', 999, 30, null, source)).toEqual({
      x: 100,
      y: 130,
      width: 200,
      height: 70,
    })
    expect(resizeCrop(rect, 'w', 500, 0, null, source)).toEqual({
      x: 300 - MIN_CROP_SIDE,
      y: 100,
      width: MIN_CROP_SIDE,
      height: 100,
    })
    expect(resizeCrop(rect, 'e', 5000, 0, null, source).width).toBe(1100)
    expect(resizeCrop(rect, 's', 0, 5000, null, source).height).toBe(700)
    for (const handle of CROP_HANDLES) {
      const dragged = resizeCrop(rect, handle, 7, -3, null, source)
      expect(dragged.width).toBeGreaterThanOrEqual(MIN_CROP_SIDE)
      expect(dragged.height).toBeGreaterThanOrEqual(MIN_CROP_SIDE)
    }
  })

  it('keeps the ratio while dragging, anchored opposite the handle', () => {
    const rect = { x: 200, y: 200, width: 300, height: 200 }
    const ratio = 3 / 2
    const corner = resizeCrop(rect, 'se', 60, 0, ratio, source)
    expect(aspectOf(corner)).toBeCloseTo(ratio, 2)
    expect(corner.x).toBe(200)
    expect(corner.y).toBe(200)
    expect(corner.width).toBe(360)

    const opposite = resizeCrop(rect, 'nw', -30, 0, ratio, source)
    expect(aspectOf(opposite)).toBeCloseTo(ratio, 2)
    expect(opposite.x + opposite.width).toBe(500)
    expect(opposite.y + opposite.height).toBe(400)

    const side = resizeCrop(rect, 'e', 150, 0, ratio, source)
    expect(aspectOf(side)).toBeCloseTo(ratio, 2)
    expect(side.width).toBe(450)
    expect(side.y + side.height / 2).toBeCloseTo(300, 0)

    const vertical = resizeCrop(rect, 's', 0, 100, ratio, source)
    expect(aspectOf(vertical)).toBeCloseTo(ratio, 2)
    expect(vertical.height).toBe(300)
    expect(vertical.x + vertical.width / 2).toBeCloseTo(350, 0)

    const huge = resizeCrop(rect, 'se', 5000, 5000, ratio, source)
    expect(aspectOf(huge)).toBeCloseTo(ratio, 2)
    expect(huge.x + huge.width).toBeLessThanOrEqual(source.width)
    expect(huge.y + huge.height).toBeLessThanOrEqual(source.height)

    const tiny = resizeCrop(rect, 'se', -5000, -5000, ratio, source)
    expect(tiny.width).toBeGreaterThanOrEqual(MIN_CROP_SIDE)
    expect(tiny.height).toBeGreaterThanOrEqual(MIN_CROP_SIDE)
    expect(aspectOf(tiny)).toBeCloseTo(ratio, 1)

    const tallRatio = resizeCrop(rect, 'ne', 0, -50, 1 / 2, source)
    expect(aspectOf(tallRatio)).toBeCloseTo(1 / 2, 2)
    expect(tallRatio.y + tallRatio.height).toBe(400)
  })
})

describe('output size', () => {
  it('derives the cropped size and resizes with or without the lock', () => {
    expect(croppedSize(source, null)).toEqual(source)
    expect(croppedSize(source, { x: 0, y: 0, width: 300, height: 100 })).toEqual({
      width: 300,
      height: 100,
    })
    expect(resizeLocked(source, { width: 600 })).toEqual({ width: 600, height: 400 })
    expect(resizeLocked(source, { height: 200 })).toEqual({ width: 300, height: 200 })
    expect(resizeFree(source, { height: 200 })).toEqual({ width: 1200, height: 200 })
    expect(resizeFree(source, {})).toEqual(source)
    expect(resizeLocked(source, { width: 100_000 }).width).toBe(MAX_OUTPUT_SIDE)
    expect(resizeFree(source, { width: 0 }).width).toBe(1)
  })

  it('scales and fits', () => {
    expect(scaleSize(source, 0.5)).toEqual({ width: 600, height: 400 })
    expect(() => scaleSize(source, 0)).toThrow(RangeError)
    expect(fitLongestSide(source, 300)).toEqual({ width: 300, height: 200 })
    expect(fitLongestSide(source, 3000)).toEqual(source)
    expect(isSameSize(source, { ...source })).toBe(true)
    expect(isSameSize(source, { width: 1, height: 800 })).toBe(false)
  })
})
