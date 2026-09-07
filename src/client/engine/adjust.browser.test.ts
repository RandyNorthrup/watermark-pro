import { describe, expect, it } from 'vitest'

import { adjustPixels } from './adjust'
import { offscreenBackend } from './canvas'
import { applyWatermark } from './pipeline'
import { meanLuminance, pixelsOf, splitBitmap } from './test-support/fixtures'
import { FILTER_BY_ID, type Adjustments } from '../../shared/adjustments'
import { DEFAULT_STYLE, type WatermarkSpec } from '../../shared/watermark'

const autoTextSpec: WatermarkSpec = {
  kind: 'text',
  text: 'PROOF',
  fontFamily: 'sans-serif',
  fontWeight: 700,
  placement: { mode: 'anchor', anchor: 'center' },
  contrast: { mode: 'auto' },
  style: { ...DEFAULT_STYLE, opacity: 1, scale: 0.3 },
}

async function variantWith(adjust: Adjustments | undefined): Promise<string | undefined> {
  const source = await splitBitmap(400, 200, '#a0a0a0', '#a0a0a0')
  const result = await applyWatermark(
    {
      source,
      marks: [{ spec: autoTextSpec }],
      output: { format: 'image/png', quality: 1 },
      ...(adjust !== undefined && { transform: { adjust } }),
    },
    offscreenBackend,
  )
  return result.marks[0]?.contrast.variant
}

describe('adjustments in the pipeline', () => {
  it('auto contrast reads the adjusted pixels, not the original', async () => {
    // A mid-grey photo takes dark ink; darkened, the same photo takes light ink.
    expect(await variantWith(undefined)).toBe('dark')
    expect(await variantWith({ ...FILTER_BY_ID.original.adjust, brightness: -0.5 })).toBe('light')
  })

  it('applies the Noir filter: darker overall, corners darkest', async () => {
    const source = await splitBitmap(400, 400, '#808080', '#808080')
    const result = await applyWatermark(
      {
        source,
        marks: [],
        output: { format: 'image/png', quality: 1 },
        transform: { adjust: FILTER_BY_ID.noir.adjust },
      },
      offscreenBackend,
    )
    const pixels = await pixelsOf(result.blob)
    const centre = meanLuminance(pixels, { x: 180, y: 180, width: 40, height: 40 })
    const corner = meanLuminance(pixels, { x: 0, y: 0, width: 40, height: 40 })
    const INPUT_GREY = 128
    expect(centre).toBeLessThan(INPUT_GREY)
    expect(corner).toBeLessThan(centre)
  })

  it('adjusts a 12-megapixel frame within budget', () => {
    const width = 4000
    const height = 3000
    const data = new Uint8ClampedArray(width * height * 4).fill(160)
    const started = performance.now()
    adjustPixels(data, width, height, FILTER_BY_ID.noir.adjust)
    const elapsed = performance.now() - started
    console.info(`adjustPixels 4000x3000 Noir: ${elapsed.toFixed(0)} ms`)
    // The real budget is ~250 ms; this guard is loose enough not to flake when
    // the whole quality gate saturates the machine, tight enough to catch a
    // large regression. The measured time is logged above for the record.
    const BUDGET_MS = 6000
    expect(elapsed).toBeLessThan(BUDGET_MS)
  })
})
