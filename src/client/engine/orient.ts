/**
 * Orientation geometry: quarter turns, flips and a straighten angle, plus the
 * affine that maps the oriented-and-straightened output frame back onto the
 * source bitmap. Pure arithmetic (no `DOMMatrix`) so it runs in Node tests and
 * in every canvas backend; `pipeline.ts` feeds the matrix to `setTransform`.
 */
import type { Size } from './layout'
import type { Orientation } from '../../shared/adjustments'

/** A 2-D affine as the six `CanvasRenderingContext2D.setTransform` arguments. */
export interface Matrix {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

const QUARTER_TURN_RADIANS = Math.PI / 2
const STRAIGHT_ANGLE_DEGREES = 180
const DEGREES_TO_RADIANS = Math.PI / STRAIGHT_ANGLE_DEGREES

export const IDENTITY_MATRIX: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

export function translate(tx: number, ty: number): Matrix {
  return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty }
}

export function scaleMatrix(sx: number, sy: number): Matrix {
  return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 }
}

/** Clockwise rotation in screen coordinates (y points down). */
export function rotate(radians: number): Matrix {
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 }
}

/** `outer ∘ inner`: the transform that applies `inner` first, then `outer`. */
export function multiply(outer: Matrix, inner: Matrix): Matrix {
  return {
    a: outer.a * inner.a + outer.c * inner.b,
    b: outer.b * inner.a + outer.d * inner.b,
    c: outer.a * inner.c + outer.c * inner.d,
    d: outer.b * inner.c + outer.d * inner.d,
    e: outer.a * inner.e + outer.c * inner.f + outer.e,
    f: outer.b * inner.e + outer.d * inner.f + outer.f,
  }
}

/** Composes transforms so that `ops[0]` is applied first. */
export function chain(ops: readonly Matrix[]): Matrix {
  let accumulated = IDENTITY_MATRIX
  for (const op of ops) {
    accumulated = multiply(op, accumulated)
  }
  return accumulated
}

/** Maps a point through an affine. */
export function apply(matrix: Matrix, x: number, y: number): { x: number; y: number } {
  return {
    x: matrix.a * x + matrix.c * y + matrix.e,
    y: matrix.b * x + matrix.d * y + matrix.f,
  }
}

/** Size of the photo after the quarter turns; flips and straighten keep the size. */
export function orientedSize(source: Size, orientation: Orientation): Size {
  return orientation.turns % 2 === 0
    ? { width: source.width, height: source.height }
    : { width: source.height, height: source.width }
}

/**
 * Largest rectangle with the oriented aspect that fits inside the oriented
 * photo rotated by `straightenDegrees`, centred on it. Returns the full size
 * at 0°; the result shrinks monotonically as the angle grows.
 */
export function straightenedSize(oriented: Size, straightenDegrees: number): Size {
  const cos = Math.abs(Math.cos(straightenDegrees * DEGREES_TO_RADIANS))
  const sin = Math.abs(Math.sin(straightenDegrees * DEGREES_TO_RADIANS))
  const { width: w, height: h } = oriented
  const k = Math.min(w / (w * cos + h * sin), h / (w * sin + h * cos))
  return { width: w * k, height: h * k }
}

/**
 * The affine mapping the oriented-and-straightened output frame's pixel space
 * (where crops are expressed, origin at its top-left) back onto the source
 * bitmap. Composition, applied to a source point in order: centre it, flip,
 * turn, straighten, then translate to the output frame's centre.
 */
export function sourceToOriented(source: Size, orientation: Orientation): Matrix {
  const oriented = orientedSize(source, orientation)
  const straightened = straightenedSize(oriented, orientation.straighten)
  const flipX = orientation.flipX ? -1 : 1
  const flipY = orientation.flipY ? -1 : 1
  return chain([
    translate(-source.width / 2, -source.height / 2),
    scaleMatrix(flipX, flipY),
    rotate(orientation.turns * QUARTER_TURN_RADIANS),
    rotate(orientation.straighten * DEGREES_TO_RADIANS),
    translate(straightened.width / 2, straightened.height / 2),
  ])
}

/** Whole output frame after turns and straighten (before any crop). */
export function orientedFrame(source: Size, orientation: Orientation): Size {
  return straightenedSize(orientedSize(source, orientation), orientation.straighten)
}
