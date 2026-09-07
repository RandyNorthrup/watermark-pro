import { parse as parseExif } from 'exifr'
import { describe, expect, it } from 'vitest'

import { extractJpegMetadata, type RawMetadata } from './segments'
import { jpegContainer, sampleExif } from '../../test-support/exif-fixtures'
import { offscreenBackend } from '../canvas'
import type { MetadataPolicy } from '../encode'
import { applyWatermark } from '../pipeline'
import { splitBitmap, textSpecFixture } from '../test-support/fixtures'

const PARSE = {
  tiff: true,
  exif: true,
  gps: true,
  mergeOutput: true,
  translateValues: false,
} as const

function sourceMetadata(): RawMetadata {
  return { exif: sampleExif(), xmp: null, density: { x: 300, y: 300, unit: 'inch' } }
}

async function exportJpeg(policy: MetadataPolicy): Promise<Uint8Array> {
  const result = await applyWatermark(
    {
      source: await splitBitmap(200, 150, '#ffffff', '#ffffff'),
      marks: [{ spec: textSpecFixture }],
      output: { format: 'image/jpeg', quality: 1, metadata: policy },
      metadata: sourceMetadata(),
    },
    offscreenBackend,
  )
  return new Uint8Array(await result.blob.arrayBuffer())
}

async function fieldsOf(bytes: Uint8Array): Promise<Record<string, unknown>> {
  const exif = extractJpegMetadata(bytes).exif
  if (exif === null) {
    return {}
  }
  const parsed: unknown = await parseExif(jpegContainer({ tiff: exif }), PARSE)
  return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
}

describe('applyWatermark metadata policy', () => {
  it('strips Exif but keeps density on strip', async () => {
    const raw = extractJpegMetadata(await exportJpeg('strip'))
    expect(raw.exif).toBeNull()
    expect(raw.density).toEqual({ x: 300, y: 300, unit: 'inch' })
  })

  it('uprights, resizes to the output and removes GPS on keep-except-location', async () => {
    const bytes = await exportJpeg('keep-except-location')
    expect(extractJpegMetadata(bytes).exif).not.toBeNull()
    const fields = await fieldsOf(bytes)
    expect(fields['Orientation']).toBe(1)
    expect(fields['ExifImageWidth']).toBe(200)
    expect(fields['latitude']).toBeUndefined()
  })

  it('keeps the GPS on keep', async () => {
    const bytes = await exportJpeg('keep')
    const fields = await fieldsOf(bytes)
    expect(fields['latitude']).toBeDefined()
  })
})
