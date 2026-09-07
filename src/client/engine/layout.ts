/**
 * Geometry of a mark on an image: size from the spec's scale, position from
 * the placement mode (anchor, custom, or smart analysis), and tile centres
 * when tiling is enabled. All outputs are image pixels.
 */
import { type LuminanceMap, read } from './analysis'
import { anchorCentre, rankPlacements } from './placement'
import { mulberry32 } from './random'
import { type Anchor, ANCHORS, type WatermarkSpec } from '../../shared/watermark'

export interface Size {
  width: number
  height: number
}

export interface MarkGeometry extends Size {
  centreX: number
  centreY: number
  /** Degrees, counter-clockwise positive. */
  rotation: number
}

export interface ResolvedPlacement {
  centreX: number
  centreY: number
  anchor: Anchor | null
  /** Mean luminance under the mark, in [0, 1]. */
  meanLuminance: number
}

/** The mark may not exceed this share of the image height, whatever the scale says. */
const MAX_HEIGHT_FRACTION = 0.9
/** Centre and span for turning a [0, 1) random into a symmetric jitter. */
const RANDOM_CENTRE = 0.5
const RANDOM_SPAN = 2

/**
 * Pixel size of the mark from the spec's scale (a fraction of the image
 * width) and the mark's intrinsic aspect ratio (width / height).
 */
export function markSize(spec: WatermarkSpec, image: Size, aspect: number): Size {
  if (!(aspect > 0) || !Number.isFinite(aspect)) {
    throw new RangeError('mark aspect ratio must be a positive finite number')
  }
  let width = spec.style.scale * image.width
  let height = width / aspect
  const maxHeight = image.height * MAX_HEIGHT_FRACTION
  if (height > maxHeight) {
    height = maxHeight
    width = height * aspect
  }
  return { width, height }
}

/** Mean luminance of the map region under a box given in image-fraction units. */
export function meanLuminanceUnder(
  map: LuminanceMap,
  centreX: number,
  centreY: number,
  widthFraction: number,
  heightFraction: number,
): number {
  const x0 = Math.max(0, Math.floor((centreX - widthFraction / 2) * map.width))
  const x1 = Math.min(map.width, Math.ceil((centreX + widthFraction / 2) * map.width))
  const y0 = Math.max(0, Math.floor((centreY - heightFraction / 2) * map.height))
  const y1 = Math.min(map.height, Math.ceil((centreY + heightFraction / 2) * map.height))
  let sum = 0
  let count = 0
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      sum += read(map.values, y * map.width + x)
      count += 1
    }
  }
  return count === 0 ? 0 : sum / count
}

function clamp(value: number, low: number, high: number): number {
  if (low > high) {
    return (low + high) / 2
  }
  return Math.min(Math.max(value, low), high)
}

/**
 * Resolves where the mark's centre goes. `map` is the downscaled luminance
 * map of the (already cropped and resized) image; it drives smart placement
 * and the auto-contrast reading for every mode.
 */
export function resolvePlacement(
  spec: WatermarkSpec,
  image: Size,
  mark: Size,
  map: LuminanceMap,
  seed = 1,
): ResolvedPlacement {
  const widthFraction = mark.width / image.width
  const heightFraction = mark.height / image.height

  if (spec.placement.mode === 'smart') {
    const [best] = rankPlacements({
      map,
      markWidth: widthFraction,
      markHeight: heightFraction,
      margin: spec.style.margin,
    })
    if (best === undefined) {
      throw new Error('placement analysis produced no candidates')
    }
    return {
      centreX: best.x * image.width,
      centreY: best.y * image.height,
      anchor: best.anchor,
      meanLuminance: best.meanLuminance,
    }
  }

  const shorter = Math.min(image.width, image.height)
  const marginX = (spec.style.margin * shorter) / image.width
  const marginY = (spec.style.margin * shorter) / image.height

  if (spec.placement.mode === 'random') {
    const next = mulberry32(seed)
    const anchor = ANCHORS[Math.floor(next() * ANCHORS.length)] ?? 'bottom-right'
    const base = anchorCentre(anchor, widthFraction, heightFraction, marginX, marginY)
    const jitter = spec.placement.jitter
    // A random offset centred on zero, up to ±jitter.
    const offsetX = (next() - RANDOM_CENTRE) * RANDOM_SPAN * jitter
    const offsetY = (next() - RANDOM_CENTRE) * RANDOM_SPAN * jitter
    const x = clamp(base.x + offsetX, widthFraction / 2, 1 - widthFraction / 2)
    const y = clamp(base.y + offsetY, heightFraction / 2, 1 - heightFraction / 2)
    return {
      centreX: x * image.width,
      centreY: y * image.height,
      anchor,
      meanLuminance: meanLuminanceUnder(map, x, y, widthFraction, heightFraction),
    }
  }

  const centre =
    spec.placement.mode === 'anchor'
      ? anchorCentre(spec.placement.anchor, widthFraction, heightFraction, marginX, marginY)
      : {
          x: clamp(spec.placement.x, widthFraction / 2, 1 - widthFraction / 2),
          y: clamp(spec.placement.y, heightFraction / 2, 1 - heightFraction / 2),
        }
  return {
    centreX: centre.x * image.width,
    centreY: centre.y * image.height,
    anchor: spec.placement.mode === 'anchor' ? spec.placement.anchor : null,
    meanLuminance: meanLuminanceUnder(map, centre.x, centre.y, widthFraction, heightFraction),
  }
}

/**
 * Tile centres covering the image in a brick pattern. The first row is
 * offset by half a step so tiles do not line up in columns; every centre
 * within one step of the image (in any direction) is included so rotated
 * marks still cover the corners.
 */
export function tileCentres(image: Size, mark: Size, spacing: number): { x: number; y: number }[] {
  const stepX = mark.width * (1 + spacing)
  const stepY = mark.height * (1 + spacing)
  if (!(stepX > 0) || !(stepY > 0)) {
    throw new RangeError('tile step must be positive')
  }
  const centres: { x: number; y: number }[] = []
  let row = 0
  for (let y = -stepY; y <= image.height + stepY; y += stepY) {
    const offset = row % 2 === 0 ? 0 : stepX / 2
    for (let x = -stepX + offset; x <= image.width + stepX; x += stepX) {
      centres.push({ x, y })
    }
    row += 1
  }
  return centres
}
