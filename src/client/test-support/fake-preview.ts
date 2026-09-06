import { vi } from 'vitest'

import type { Anchor, WatermarkSpec } from '../../shared/watermark'
import type { EncodeOptions } from '../engine/encode'
import type { Transform } from '../engine/pipeline'
import type { PreviewResult, RenderOptions } from '../lib/preview'

/**
 * Replacement for `lib/preview` in jsdom, where there is no canvas, worker or
 * object URL. Records every render and export so tests can assert what the
 * designer and editor asked for.
 */
export const renderedSpecs: WatermarkSpec[] = []
export const renderedTransforms: (Transform | undefined)[] = []
export const exports: { spec: WatermarkSpec; output: EncodeOptions; transform?: Transform }[] = []

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

  render(spec: WatermarkSpec, options: RenderOptions = {}): Promise<PreviewResult | null> {
    renderedSpecs.push(spec)
    renderedTransforms.push(options.transform)
    const width = options.transform?.resize?.width ?? options.transform?.crop?.width ?? SAMPLE_WIDTH
    const height =
      options.transform?.resize?.height ?? options.transform?.crop?.height ?? SAMPLE_HEIGHT
    return Promise.resolve({
      url: `blob:preview-${String(renderedSpecs.length)}`,
      width,
      height,
      placement: {
        centreX: width * FAKE_CENTRE_X,
        centreY: height * FAKE_CENTRE_Y,
        anchor: fakeAnchor(spec),
        width: width * spec.style.scale,
        height: (width * spec.style.scale) / FAKE_ASPECT,
        rotation: spec.style.rotation,
      },
      contrast: { variant: 'dark', outline: 0, isAuto: true },
    })
  }

  exportFull(spec: WatermarkSpec, output: EncodeOptions, transform?: Transform): Promise<Blob> {
    exports.push(transform === undefined ? { spec, output } : { spec, output, transform })
    return Promise.resolve(new Blob(['fake image'], { type: output.format }))
  }

  dispose(): void {
    PreviewRenderer.disposed += 1
  }
}

export function resetFakePreview(): void {
  renderedSpecs.length = 0
  renderedTransforms.length = 0
  exports.length = 0
  PreviewRenderer.instances = 0
  PreviewRenderer.disposed = 0
}
