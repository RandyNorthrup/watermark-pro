import { parse as parseExif } from 'exifr'
import { describe, expect, it } from 'vitest'

import { extractJpegMetadata, extractPngMetadata, type RawMetadata } from './segments'
import { withMetadata } from './write'
import { jpegContainer, minimalPng, sampleExif } from '../../test-support/exif-fixtures'
import type { MetadataPolicy, OutputFormat } from '../encode'

const XMP = new TextEncoder().encode('<x:xmpmeta>test</x:xmpmeta>')
const SIZE = { width: 1200, height: 900 }
const PARSE = {
  tiff: true,
  exif: true,
  gps: true,
  mergeOutput: true,
  translateValues: false,
} as const

function source(): RawMetadata {
  return { exif: sampleExif(), xmp: XMP, density: { x: 300, y: 300, unit: 'inch' } }
}

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

function jpegBlob(): Blob {
  return new Blob([jpegContainer({})] as BlobPart[], { type: 'image/jpeg' })
}

async function fields(exif: Uint8Array | null): Promise<Record<string, unknown>> {
  if (exif === null) {
    return {}
  }
  const parsed: unknown = await parseExif(jpegContainer({ tiff: exif }), PARSE)
  return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
}

/** Runs one policy over a blob and returns the written-back bytes. */
async function applied(
  blob: Blob,
  format: OutputFormat,
  policy: MetadataPolicy,
): Promise<Uint8Array> {
  const out = await withMetadata(blob, format, source(), policy, SIZE)
  return await bytesOf(out)
}

describe('withMetadata (JPEG)', () => {
  it('strip keeps only the density', async () => {
    const bytes = await applied(jpegBlob(), 'image/jpeg', 'strip')
    const raw = extractJpegMetadata(bytes)
    expect(raw.exif).toBeNull()
    expect(raw.density).toEqual({ x: 300, y: 300, unit: 'inch' })
  })

  it('keep-except-location uprights, resizes and drops GPS', async () => {
    const bytes = await applied(jpegBlob(), 'image/jpeg', 'keep-except-location')
    const raw = extractJpegMetadata(bytes)
    expect(raw.exif).not.toBeNull()
    const parsed = await fields(raw.exif)
    expect(parsed['latitude']).toBeUndefined()
    expect(parsed['Orientation']).toBe(1)
    expect(parsed['ExifImageWidth']).toBe(1200)
  })

  it('keep retains the GPS and the XMP packet', async () => {
    const bytes = await applied(jpegBlob(), 'image/jpeg', 'keep')
    const raw = extractJpegMetadata(bytes)
    expect(raw.xmp).not.toBeNull()
    const parsed = await fields(raw.exif)
    expect(parsed['latitude']).toBeDefined()
  })
})

describe('withMetadata (PNG)', () => {
  it('keep-except-location writes an eXIf chunk with no GPS', async () => {
    const png = new Blob([minimalPng()] as BlobPart[], { type: 'image/png' })
    const bytes = await applied(png, 'image/png', 'keep-except-location')
    const raw = extractPngMetadata(bytes)
    expect(raw.exif).not.toBeNull()
    const parsed = await fields(raw.exif)
    expect(parsed['latitude']).toBeUndefined()
    expect(raw.density?.x).toBeCloseTo(300, 0)
  })
})

describe('withMetadata (WebP)', () => {
  it('returns the blob unchanged for strip and throws for keep modes', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' })
    expect(await withMetadata(blob, 'image/webp', source(), 'strip', SIZE)).toBe(blob)
    await expect(withMetadata(blob, 'image/webp', source(), 'keep', SIZE)).rejects.toThrow(
      RangeError,
    )
    await expect(
      withMetadata(blob, 'image/webp', source(), 'keep-except-location', SIZE),
    ).rejects.toThrow(RangeError)
  })
})
