/**
 * The drawing surface the engine renders on, behind an interface so the same
 * pipeline runs on `OffscreenCanvas` inside a Web Worker and on an
 * `HTMLCanvasElement` on the main thread. The second path exists for engines
 * without `OffscreenCanvas` (Safari before 16.4, and Playwright's Windows
 * WebKit build); which one a page gets is decided once by capability
 * detection in `src/client/lib/canvas-backend.ts`.
 *
 * This module is compiled under the WebWorker library as well as the DOM
 * library, so it names only types both provide.
 */
import type { EncodeOptions } from './encode'

/**
 * A 2D context. The offscreen type is the common denominator available under
 * the WebWorker library; a `CanvasRenderingContext2D` satisfies it once its
 * `canvas` back-reference (the only member with a DOM-specific type) is set
 * aside.
 */
export type Canvas2D = Omit<OffscreenCanvasRenderingContext2D, 'canvas'>

export interface EngineCanvas {
  readonly width: number
  readonly height: number
  /** The 2D context; throws when the platform cannot provide one. */
  readonly context: Canvas2D
  /** Encodes the pixels as the requested type. Callers verify the result's type. */
  encode(options: EncodeOptions): Promise<Blob>
  /** A bitmap copy of the pixels. */
  toBitmap(): Promise<ImageBitmap>
}

export interface CanvasBackend {
  /** A blank canvas; sizes are rounded and never smaller than one pixel. */
  createCanvas(width: number, height: number): EngineCanvas
}

/** Canvas dimensions are integers of at least one pixel. */
export function canvasSide(value: number): number {
  return Math.max(1, Math.round(value))
}

export function contextOf(canvas: { getContext(contextId: '2d'): Canvas2D | null }): Canvas2D {
  const ctx = canvas.getContext('2d')
  if (ctx === null) {
    throw new Error('2D canvas context is unavailable')
  }
  return ctx
}

class OffscreenEngineCanvas implements EngineCanvas {
  readonly #canvas: OffscreenCanvas
  readonly context: Canvas2D

  constructor(width: number, height: number) {
    this.#canvas = new OffscreenCanvas(canvasSide(width), canvasSide(height))
    this.context = contextOf(this.#canvas)
  }

  get width(): number {
    return this.#canvas.width
  }

  get height(): number {
    return this.#canvas.height
  }

  encode(options: EncodeOptions): Promise<Blob> {
    return this.#canvas.convertToBlob({ type: options.format, quality: options.quality })
  }

  toBitmap(): Promise<ImageBitmap> {
    return createImageBitmap(this.#canvas)
  }
}

/** Backend over `OffscreenCanvas`; usable wherever that constructor exists. */
export const offscreenBackend: CanvasBackend = {
  createCanvas: (width, height) => new OffscreenEngineCanvas(width, height),
}
