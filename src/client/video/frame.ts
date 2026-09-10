/**
 * A full `OffscreenCanvasRenderingContext2D` for a canvas. mediabunny's
 * `VideoSample.draw` needs the `canvas` back-reference the engine's `Canvas2D`
 * type omits, and the same object still satisfies the engine's `composeMark`
 * (as the M17.0 spike proved). Native browser tests include this helper in V8 coverage.
 */
export function context2d(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext('2d')
  if (ctx === null) {
    throw new Error('This browser cannot provide a 2D canvas context for video.')
  }
  return ctx
}
