import { vi } from 'vitest'

import type { Anchor, WatermarkSpec } from '../../shared/watermark'
import type { EncodeOptions } from '../engine/encode'
import type { Transform } from '../engine/pipeline'
import type { PreviewResult, RenderOptions, SpecInput } from '../lib/preview'

/**
 * Replacement for `lib/preview` in jsdom, where there is no canvas, worker or
 * object URL. Records every render and export so tests can assert what the
 * designer and editor asked for.
 */
/** The marks of every render, in order; a render with no marks records an empty list. */
export const renderedBatches: WatermarkSpec[][] = []
/** The topmost mark of every render that drew one, for single-mark assertions. */
export const renderedSpecs: WatermarkSpec[] = []
export const renderedTransforms: (Transform | undefined)[] = []
export const exports: { specs: WatermarkSpec[]; output: EncodeOptions; transform?: Transform }[] =
  []

function specList(input: SpecInput): WatermarkSpec[] {
  return 'kind' in input ? [input] : [...input]
}

const SAMPLE_WIDTH = 960
const SAMPLE_HEIGHT = 640
const FAKE_CENTRE_X = 0.8
const FAKE_CENTRE_Y = 0.9
const FAKE_ASPECT = 4

/** Smart placement always "finds" the bottom right, as the real engine does on the sample scene. */
function fakeAnchor(spec: WatermarkSpec): Anchor | null {
  if (spec.placement.mode === 'anchor') {
    return spec.placement.anchor
  }
  return spec.placement.mode === 'smart' ? 'bottom-right' : null
}

function resolved(): Promise<void> {
  return Promise.resolve()
}

export class PreviewRenderer {
  static instances = 0
  static disposed = 0

  sourceSize = { width: SAMPLE_WIDTH, height: SAMPLE_HEIGHT }

  subjectScale = 1

  setSubject = vi.fn(resolved)

  forgetLogo = vi.fn()

  constructor() {
    PreviewRenderer.instances += 1
  }

  render(input: SpecInput, options: RenderOptions = {}): Promise<PreviewResult | null> {
    const specs = specList(input)
    renderedBatches.push(specs)
    const top = specs.at(-1)
    if (top !== undefined) {
      renderedSpecs.push(top)
    }
    renderedTransforms.push(options.transform)
    const width = options.transform?.resize?.width ?? options.transform?.crop?.width ?? SAMPLE_WIDTH
    const height =
      options.transform?.resize?.height ?? options.transform?.crop?.height ?? SAMPLE_HEIGHT
    return Promise.resolve({
      url: `blob:preview-${String(renderedBatches.length)}`,
      width,
      height,
      marks: specs.map((spec) => ({
        placement: {
          centreX: width * FAKE_CENTRE_X,
          centreY: height * FAKE_CENTRE_Y,
          anchor: fakeAnchor(spec),
          width: width * spec.style.scale,
          height: (width * spec.style.scale) / FAKE_ASPECT,
          rotation: spec.style.rotation,
        },
        contrast: { variant: 'dark', fill: '#0f172a', outline: 0, isAuto: true },
      })),
    })
  }

  exportFull(input: SpecInput, output: EncodeOptions, transform?: Transform): Promise<Blob> {
    const specs = specList(input)
    exports.push(transform === undefined ? { specs, output } : { specs, output, transform })
    return Promise.resolve(new Blob(['fake image'], { type: output.format }))
  }

  dispose(): void {
    PreviewRenderer.disposed += 1
  }
}

export function resetFakePreview(): void {
  renderedBatches.length = 0
  renderedSpecs.length = 0
  renderedTransforms.length = 0
  exports.length = 0
  PreviewRenderer.instances = 0
  PreviewRenderer.disposed = 0
}
