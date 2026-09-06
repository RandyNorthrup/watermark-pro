/**
 * Smart placement (PLAN.md §5.2). Scores candidate boxes on a downscaled
 * luminance map and returns them best first. Deterministic: the same map and
 * mark size always produce the same ordering.
 */
import {
  type Box,
  boxSum,
  integralImage,
  type IntegralImage,
  type LuminanceMap,
  regionStats,
  sobelMagnitude,
} from './analysis'
import { ANCHORS, type Anchor } from '../../shared/watermark'

/** Relative weights of the cost terms. All are unitless and sum to 1. */
export const PLACEMENT_WEIGHTS = {
  /** Busy regions (many edges) hide the mark and get busy themselves. */
  edges: 0.4,
  /** Textured regions read poorly. */
  variance: 0.2,
  /** Distance from the image centre and contrast against the image mean approximate the subject. */
  saliency: 0.3,
  /** Photographer convention: bottom-right, then bottom-left, then the top. */
  prior: 0.1,
} as const

/** Lower is better. The order encodes convention among otherwise equal spots. */
const ANCHOR_PRIOR: Record<Anchor, number> = {
  'bottom-right': 0,
  'bottom-left': 0.15,
  'top-right': 0.3,
  'top-left': 0.35,
  'bottom-center': 0.5,
  'top-center': 0.6,
  'middle-right': 0.8,
  'middle-left': 0.85,
  center: 1,
}

/** The free space is divided this many times to place the sliding candidates. */
const GRID_DIVISIONS = 4
/** Interior grid steps as fractions of the free space: 1/4, 2/4, 3/4. */
const GRID_STEPS = Array.from(
  { length: GRID_DIVISIONS - 1 },
  (_, index) => (index + 1) / GRID_DIVISIONS,
)
const GRID_PRIOR = 0.7
/** Decimal places used to de-duplicate candidate centres. */
const KEY_PRECISION = 4
/** Image centre in fraction units, and the distance from it to a corner. */
const CENTRE = 0.5
const CORNER_DISTANCE = Math.hypot(CENTRE, CENTRE)
/** Saliency mixes centre proximity and contrast against the scene evenly. */
const SALIENCY_CENTRE_SHARE = 0.5

export interface PlacementCandidate {
  /** Centre of the mark as fractions of the image width and height. */
  x: number
  y: number
  /** Anchor name when the candidate is one of the nine anchors. */
  anchor: Anchor | null
  cost: number
  /** Mean luminance under the box, for the contrast chooser. */
  meanLuminance: number
}

export interface PlacementRequest {
  map: LuminanceMap
  /** Mark size as fractions of the image width and height. */
  markWidth: number
  markHeight: number
  /** Distance from the edges as a fraction of the shorter side. */
  margin: number
}

interface Analysis {
  values: IntegralImage
  squares: IntegralImage
  edges: IntegralImage
  globalMean: number
}

function analyse(map: LuminanceMap): Analysis {
  const values = integralImage(map)
  const squares = integralImage(map, (v) => v * v)
  const edges = integralImage(sobelMagnitude(map))
  const total = map.width * map.height
  const globalMean =
    total === 0 ? 0 : boxSum(values, { x: 0, y: 0, width: map.width, height: map.height }) / total
  return { values, squares, edges, globalMean }
}

/** Centre fractions for a given anchor with the mark and margin sizes applied. */
export function anchorCentre(
  anchor: Anchor,
  markWidth: number,
  markHeight: number,
  marginX: number,
  marginY: number,
): { x: number; y: number } {
  const left = marginX + markWidth / 2
  const right = 1 - marginX - markWidth / 2
  const top = marginY + markHeight / 2
  const bottom = 1 - marginY - markHeight / 2
  const centreX = 0.5
  const centreY = 0.5
  const xs: Record<Anchor, number> = {
    'top-left': left,
    'top-center': centreX,
    'top-right': right,
    'middle-left': left,
    center: centreX,
    'middle-right': right,
    'bottom-left': left,
    'bottom-center': centreX,
    'bottom-right': right,
  }
  const ys: Record<Anchor, number> = {
    'top-left': top,
    'top-center': top,
    'top-right': top,
    'middle-left': centreY,
    center: centreY,
    'middle-right': centreY,
    'bottom-left': bottom,
    'bottom-center': bottom,
    'bottom-right': bottom,
  }
  return { x: clamp(xs[anchor], left, right), y: clamp(ys[anchor], top, bottom) }
}

function clamp(value: number, low: number, high: number): number {
  if (low > high) {
    return (low + high) / 2
  }
  return Math.min(Math.max(value, low), high)
}

/** Fractions of the shorter side become fractions of each axis. */
function marginFractions(map: LuminanceMap, margin: number): { x: number; y: number } {
  const shorter = Math.min(map.width, map.height)
  return { x: (margin * shorter) / map.width, y: (margin * shorter) / map.height }
}

function costOf(
  analysis: Analysis,
  map: LuminanceMap,
  centre: { x: number; y: number },
  request: PlacementRequest,
  prior: number,
) {
  const box: Box = {
    x: (centre.x - request.markWidth / 2) * map.width,
    y: (centre.y - request.markHeight / 2) * map.height,
    width: request.markWidth * map.width,
    height: request.markHeight * map.height,
  }
  const stats = regionStats(analysis.values, analysis.squares, box)
  const edgeStats = regionStats(analysis.edges, analysis.edges, box)
  // Distance from the centre in [0, 1]: 0 at the centre, 1 at a corner.
  const centreDistance = Math.hypot(centre.x - CENTRE, centre.y - CENTRE) / CORNER_DISTANCE
  const contrastToScene = Math.abs(stats.mean - analysis.globalMean)
  const saliency =
    (1 - centreDistance) * SALIENCY_CENTRE_SHARE + contrastToScene * (1 - SALIENCY_CENTRE_SHARE)
  const cost =
    PLACEMENT_WEIGHTS.edges * edgeStats.mean +
    PLACEMENT_WEIGHTS.variance * Math.sqrt(stats.variance) +
    PLACEMENT_WEIGHTS.saliency * saliency +
    PLACEMENT_WEIGHTS.prior * prior
  return { cost, meanLuminance: stats.mean }
}

/**
 * Ranks the nine anchors plus a coarse grid of interior positions. The mark
 * must fit inside the image with its margin; when it cannot, candidates
 * collapse towards the centre.
 */
export function rankPlacements(request: PlacementRequest): PlacementCandidate[] {
  const { map } = request
  if (map.width === 0 || map.height === 0) {
    throw new RangeError('cannot place a watermark on an empty image')
  }
  const analysis = analyse(map)
  const margin = marginFractions(map, request.margin)
  const candidates: PlacementCandidate[] = []
  const seen = new Set<string>()
  const push = (centre: { x: number; y: number }, anchor: Anchor | null, prior: number) => {
    const key = `${centre.x.toFixed(KEY_PRECISION)},${centre.y.toFixed(KEY_PRECISION)}`
    if (seen.has(key)) {
      return
    }
    seen.add(key)
    const { cost, meanLuminance } = costOf(analysis, map, centre, request, prior)
    candidates.push({ x: centre.x, y: centre.y, anchor, cost, meanLuminance })
  }

  for (const anchor of ANCHORS) {
    push(
      anchorCentre(anchor, request.markWidth, request.markHeight, margin.x, margin.y),
      anchor,
      ANCHOR_PRIOR[anchor],
    )
  }
  const left = margin.x + request.markWidth / 2
  const right = 1 - margin.x - request.markWidth / 2
  const top = margin.y + request.markHeight / 2
  const bottom = 1 - margin.y - request.markHeight / 2
  for (const stepX of GRID_STEPS) {
    for (const stepY of GRID_STEPS) {
      push(
        {
          x: clamp(left + (right - left) * stepX, left, right),
          y: clamp(top + (bottom - top) * stepY, top, bottom),
        },
        null,
        GRID_PRIOR,
      )
    }
  }
  candidates.sort((a, b) => a.cost - b.cost || a.y - b.y || a.x - b.x)
  return candidates
}
