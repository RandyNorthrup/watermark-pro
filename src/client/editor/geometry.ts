/**
 * Pure crop and resize arithmetic for the editor. Everything is in source
 * pixels; the components translate pointer movement into these calls and
 * the renderer scales the result to whatever it draws at.
 */
import type { Size } from '../engine/layout'
import type { CropRect } from '../engine/pipeline'

export type { CropRect } from '../engine/pipeline'

/** Smallest crop the editor allows on either side. */
export const MIN_CROP_SIDE = 16
/** Largest output side; canvases beyond this fail in every browser. */
export const MAX_OUTPUT_SIDE = 8192
export const MIN_OUTPUT_SIDE = 1

export interface AspectPreset {
  id: string
  label: string
  /** width / height; `null` is free-form, `'original'` follows the photo. */
  ratio: number | null | 'original'
}

/** Builds a preset from its label, so the ratio and the label cannot disagree. */
function ratioPreset(id: string, label: `${number}:${number}`): AspectPreset {
  const [width, height] = label.split(':').map(Number)
  if (width === undefined || height === undefined || !(width > 0) || !(height > 0)) {
    throw new RangeError(`bad aspect label ${label}`)
  }
  return { id, label, ratio: width / height }
}

export const ASPECT_PRESETS: readonly AspectPreset[] = [
  { id: 'free', label: 'Free', ratio: null },
  { id: 'original', label: 'Original', ratio: 'original' },
  ratioPreset('square', '1:1'),
  ratioPreset('landscape-4-3', '4:3'),
  ratioPreset('landscape-3-2', '3:2'),
  ratioPreset('wide-16-9', '16:9'),
  ratioPreset('portrait-4-5', '4:5'),
  ratioPreset('portrait-9-16', '9:16'),
]

export type CropHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export const CROP_HANDLES: readonly CropHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high)
}

/** Resolves a preset ratio against the photo. */
export function resolveRatio(preset: AspectPreset, source: Size): number | null {
  if (preset.ratio === 'original') {
    return source.width / source.height
  }
  return preset.ratio
}

/** Whole crop: the photo itself. */
export function fullCrop(source: Size): CropRect {
  return { x: 0, y: 0, width: source.width, height: source.height }
}

/** Keeps a rectangle inside the photo, shrinking before moving. */
export function clampCrop(rect: CropRect, source: Size): CropRect {
  const width = clamp(Math.round(rect.width), Math.min(MIN_CROP_SIDE, source.width), source.width)
  const height = clamp(
    Math.round(rect.height),
    Math.min(MIN_CROP_SIDE, source.height),
    source.height,
  )
  return {
    x: clamp(Math.round(rect.x), 0, source.width - width),
    y: clamp(Math.round(rect.y), 0, source.height - height),
    width,
    height,
  }
}

/**
 * Largest rectangle of the given ratio that fits inside `source`, centred
 * on the centre of `around` (or the photo). Used when a preset is chosen.
 */
export function cropForRatio(source: Size, ratio: number | null, around?: CropRect): CropRect {
  if (ratio === null) {
    return around === undefined ? fullCrop(source) : clampCrop(around, source)
  }
  let width = source.width
  let height = width / ratio
  if (height > source.height) {
    height = source.height
    width = height * ratio
  }
  const centreX = around === undefined ? source.width / 2 : around.x + around.width / 2
  const centreY = around === undefined ? source.height / 2 : around.y + around.height / 2
  return clampCrop({ x: centreX - width / 2, y: centreY - height / 2, width, height }, source)
}

export function moveCrop(rect: CropRect, dx: number, dy: number, source: Size): CropRect {
  return clampCrop({ ...rect, x: rect.x + dx, y: rect.y + dy }, source)
}

/**
 * Drags one handle by (dx, dy). Edges opposite the handle stay put. With a
 * ratio, the height follows the width for side handles and the dominant
 * axis for corners, anchored at the opposite corner.
 */
export function resizeCrop(
  rect: CropRect,
  handle: CropHandle,
  dx: number,
  dy: number,
  ratio: number | null,
  source: Size,
): CropRect {
  let left = rect.x
  let top = rect.y
  let right = rect.x + rect.width
  let bottom = rect.y + rect.height
  if (handle.includes('w')) {
    left = clamp(left + dx, 0, right - MIN_CROP_SIDE)
  }
  if (handle.includes('e')) {
    right = clamp(right + dx, left + MIN_CROP_SIDE, source.width)
  }
  if (handle.includes('n')) {
    top = clamp(top + dy, 0, bottom - MIN_CROP_SIDE)
  }
  if (handle.includes('s')) {
    bottom = clamp(bottom + dy, top + MIN_CROP_SIDE, source.height)
  }
  let width = right - left
  let height = bottom - top
  if (ratio !== null) {
    const isVertical = handle === 'n' || handle === 's'
    if (isVertical) {
      width = height * ratio
    } else {
      height = width / ratio
    }
    // The anchored corner is the one opposite the handle.
    const anchorX = handle.includes('w') ? right : left
    const anchorY = handle.includes('n') ? bottom : top
    const maxWidth = handle.includes('w') ? anchorX : source.width - anchorX
    const maxHeight = handle.includes('n') ? anchorY : source.height - anchorY
    if (width > maxWidth) {
      width = maxWidth
      height = width / ratio
    }
    if (height > maxHeight) {
      height = maxHeight
      width = height * ratio
    }
    if (width < MIN_CROP_SIDE || height < MIN_CROP_SIDE) {
      const minWidth = Math.max(MIN_CROP_SIDE, MIN_CROP_SIDE * ratio)
      width = minWidth
      height = minWidth / ratio
    }
    left = handle.includes('w') ? anchorX - width : anchorX
    top = handle.includes('n') ? anchorY - height : anchorY
    if (isVertical) {
      left = clamp(rect.x + rect.width / 2 - width / 2, 0, source.width - width)
    }
    if (handle === 'e' || handle === 'w') {
      top = clamp(rect.y + rect.height / 2 - height / 2, 0, source.height - height)
    }
  }
  return clampCrop({ x: left, y: top, width, height }, source)
}

/** Output size before any explicit resize. */
export function croppedSize(source: Size, crop: CropRect | null): Size {
  return crop === null ? source : { width: crop.width, height: crop.height }
}

function clampSide(value: number): number {
  return clamp(Math.round(value), MIN_OUTPUT_SIDE, MAX_OUTPUT_SIDE)
}

/** New size when one side changes and the aspect ratio is locked. */
export function resizeLocked(base: Size, change: { width: number } | { height: number }): Size {
  const aspect = base.width / base.height
  if ('width' in change) {
    const width = clampSide(change.width)
    return { width, height: clampSide(width / aspect) }
  }
  const height = clampSide(change.height)
  return { width: clampSide(height * aspect), height }
}

/** New size when one side changes freely. */
export function resizeFree(base: Size, change: Partial<Size>): Size {
  return {
    width: clampSide(change.width ?? base.width),
    height: clampSide(change.height ?? base.height),
  }
}

/** Uniform scale of a size, for percentage presets. */
export function scaleSize(base: Size, factor: number): Size {
  if (!(factor > 0)) {
    throw new RangeError('scale factor must be positive')
  }
  return { width: clampSide(base.width * factor), height: clampSide(base.height * factor) }
}

/** Fits the longest side to `side`, never enlarging. */
export function fitLongestSide(base: Size, side: number): Size {
  const longest = Math.max(base.width, base.height)
  return longest <= side ? { ...base } : scaleSize(base, side / longest)
}

export function isSameSize(a: Size, b: Size): boolean {
  return a.width === b.width && a.height === b.height
}
