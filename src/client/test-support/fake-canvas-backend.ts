/**
 * Replacement for `lib/canvas-backend` in jsdom, where no canvas can draw:
 * a backend whose contexts swallow every call and whose `encode` hands back
 * a tiny PNG, so components that render off-screen (the signature pad) can
 * be driven end to end without pixels.
 */
import type { Canvas2D, CanvasBackend, EngineCanvas } from '../engine/canvas'
import type { EncodeOptions } from '../engine/encode'

/** Records every encode so tests can assert what was saved. */
export const encoded: { width: number; height: number; options: EncodeOptions }[] = []

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function ignoreCall(): undefined {
  // Drawing calls have nothing to draw on in jsdom.
}

/** Any method is a no-op and any property reads as undefined; enough for drawing code. */
const noopContext: Canvas2D = new Proxy({} as never, {
  get: () => ignoreCall,
  set: () => true,
})

class FakeCanvas implements EngineCanvas {
  readonly context = noopContext
  readonly width: number
  readonly height: number

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
  }

  encode(options: EncodeOptions): Promise<Blob> {
    encoded.push({ width: this.width, height: this.height, options })
    return Promise.resolve(new Blob([PNG_BYTES], { type: options.format }))
  }

  toBitmap(): Promise<ImageBitmap> {
    return Promise.reject(new Error('no bitmaps in jsdom'))
  }
}

export const domBackend: CanvasBackend = {
  createCanvas: (width, height) => new FakeCanvas(Math.round(width), Math.round(height)),
}

export function hasOffscreenCanvas(): boolean {
  return false
}

export function mainThreadBackend(): CanvasBackend {
  return domBackend
}

export function createEngine(): never {
  throw new Error('the engine is not available in jsdom; mock lib/preview instead')
}

export function resetFakeCanvasBackend(): void {
  encoded.length = 0
}
