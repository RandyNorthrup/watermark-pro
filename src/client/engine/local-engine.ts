/**
 * The engine on the calling thread, for browsers whose workers cannot draw
 * (no `OffscreenCanvas`: Safari before 16.4 and Playwright's Windows WebKit
 * build). Same pipeline, same results, same ownership rules as the worker:
 * bitmaps handed in are closed when the request settles.
 */
import type { CanvasBackend } from './canvas'
import {
  type ApplyInput,
  type ApplyOutput,
  closeInputBitmaps,
  toApplyRequest,
  type WatermarkEngine,
} from './engine'
import { FontLoader } from './fonts'
import { applyWatermark } from './pipeline'

export class LocalEngineError extends Error {
  override readonly name = 'LocalEngineError'
}

export class LocalEngine implements WatermarkEngine {
  readonly #backend: CanvasBackend
  readonly #fonts: FontLoader
  #busy = 0
  #isTerminated = false

  constructor(backend: CanvasBackend, fonts: FontFaceSet) {
    this.#backend = backend
    this.#fonts = new FontLoader(fonts)
  }

  get busy(): number {
    return this.#busy
  }

  async apply(input: ApplyInput): Promise<ApplyOutput> {
    this.#busy += 1
    try {
      if (this.#isTerminated) {
        throw new LocalEngineError('watermark engine terminated')
      }
      await this.#fonts.ensure(input.fonts)
      return await applyWatermark(toApplyRequest(input), this.#backend)
    } finally {
      this.#busy -= 1
      closeInputBitmaps(input)
    }
  }

  terminate(): void {
    this.#isTerminated = true
  }
}
