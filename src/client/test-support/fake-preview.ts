import { vi } from 'vitest'

import type { WatermarkSpec } from '../../shared/watermark'
import type { PreviewResult } from '../lib/preview'

/**
 * Replacement for `lib/preview` in jsdom, where there is no canvas, worker or
 * object URL. Records every spec rendered so tests can assert what the
 * designer asked for.
 */
export const renderedSpecs: WatermarkSpec[] = []

function resolved(): Promise<void> {
  return Promise.resolve()
}

export class PreviewRenderer {
  static instances = 0
  static disposed = 0

  setSubject = vi.fn(resolved)

  forgetLogo = vi.fn()

  constructor() {
    PreviewRenderer.instances += 1
  }

  render(spec: WatermarkSpec): Promise<PreviewResult | null> {
    renderedSpecs.push(spec)
    return Promise.resolve({
      url: `blob:preview-${String(renderedSpecs.length)}`,
      width: 960,
      height: 640,
      placement: { centreX: 800, centreY: 580, anchor: 'bottom-right' },
      contrast: { variant: 'dark', outline: 0, isAuto: true },
    })
  }

  dispose(): void {
    PreviewRenderer.disposed += 1
  }
}

export function resetFakePreview(): void {
  renderedSpecs.length = 0
  PreviewRenderer.instances = 0
  PreviewRenderer.disposed = 0
}
