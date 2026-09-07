/**
 * Chooses how this browser draws. With `OffscreenCanvas` the engine runs in
 * Web Workers and main-thread helpers (thumbnails, the sample scene) use
 * offscreen canvases too. Without it (Safari before 16.4, Playwright's
 * Windows WebKit build) everything draws on `HTMLCanvasElement` on the main
 * thread through `LocalEngine`. The choice is made by capability detection,
 * not by user agent, and both paths are covered by the browser tests.
 */
import {
  type CanvasBackend,
  canvasSide,
  contextOf,
  type EngineCanvas,
  offscreenBackend,
} from '../engine/canvas'
import type { EncodeOptions } from '../engine/encode'
import type { ApplyInput, ApplyOutput, WatermarkEngine } from '../engine/engine'
import { WatermarkWorker } from '../engine/worker-client'

class DomEngineCanvas implements EngineCanvas {
  readonly #canvas: HTMLCanvasElement
  readonly context

  constructor(width: number, height: number) {
    this.#canvas = document.createElement('canvas')
    this.#canvas.width = canvasSide(width)
    this.#canvas.height = canvasSide(height)
    this.context = contextOf(this.#canvas)
  }

  get width(): number {
    return this.#canvas.width
  }

  get height(): number {
    return this.#canvas.height
  }

  encode(options: EncodeOptions): Promise<Blob> {
    return new Promise((resolve, reject) => {
      this.#canvas.toBlob(
        (blob) => {
          if (blob === null) {
            reject(new Error(`this browser cannot encode ${options.format}`))
          } else {
            resolve(blob)
          }
        },
        options.format,
        options.quality,
      )
    })
  }

  toBitmap(): Promise<ImageBitmap> {
    return createImageBitmap(this.#canvas)
  }
}

/** Backend over `HTMLCanvasElement`; main thread only. */
export const domBackend: CanvasBackend = {
  createCanvas: (width, height) => new DomEngineCanvas(width, height),
}

export function hasOffscreenCanvas(): boolean {
  return typeof OffscreenCanvas === 'function'
}

/** The backend for main-thread drawing in this browser. */
export function mainThreadBackend(): CanvasBackend {
  return hasOffscreenCanvas() ? offscreenBackend : domBackend
}

/**
 * The main-thread engine, loaded on first use. The pipeline already ships in
 * the worker chunk; browsers with `OffscreenCanvas` never download it twice,
 * and browsers without it pay for it only when they render.
 */
class DeferredLocalEngine implements WatermarkEngine {
  #engine: Promise<WatermarkEngine> | null = null
  #busy = 0
  #isTerminated = false

  async #load(): Promise<WatermarkEngine> {
    this.#engine ??= this.#create()
    return await this.#engine
  }

  async #create(): Promise<WatermarkEngine> {
    const { LocalEngine } = await import('../engine/local-engine')
    return new LocalEngine(domBackend, document.fonts)
  }

  get busy(): number {
    return this.#busy
  }

  async apply(input: ApplyInput): Promise<ApplyOutput> {
    this.#busy += 1
    try {
      const engine = await this.#load()
      if (this.#isTerminated) {
        engine.terminate()
      }
      return await engine.apply(input)
    } finally {
      this.#busy -= 1
    }
  }

  terminate(): void {
    this.#isTerminated = true
    if (this.#engine !== null) {
      void this.#engine.then((engine) => {
        engine.terminate()
      })
    }
  }
}

/** A fresh engine: a Web Worker where workers can draw, the calling thread otherwise. */
export function createEngine(): WatermarkEngine {
  return hasOffscreenCanvas() ? new WatermarkWorker() : new DeferredLocalEngine()
}
