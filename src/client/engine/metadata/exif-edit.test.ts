import { parse as parseExif } from 'exifr'
import { describe, expect, it } from 'vitest'

import { readDensity, removeLocation, setOrientation, setPixelDimensions } from './exif-edit'
import { buildExifTiff, jpegContainer } from '../../test-support/exif-fixtures'

const EXIFR_OPTIONS = {
  tiff: true,
  exif: true,
  gps: true,
  mergeOutput: true,
  translateValues: false,
} as const

function fullTiff(): Uint8Array {
  return buildExifTiff({
    orientation: 6,
    xResolution: 300,
    yResolution: 300,
    pixelWidth: 4000,
    pixelHeight: 3000,
    gps: { latitude: [51, 30, 27], longitude: [0, 7, 40], latitudeRef: 'N', longitudeRef: 'W' },
  })
}

async function parse(tiff: Uint8Array): Promise<Record<string, unknown>> {
  const result: unknown = await parseExif(jpegContainer({ tiff }), EXIFR_OPTIONS)
  return typeof result === 'object' && result !== null ? (result as Record<string, unknown>) : {}
}

describe('exif-edit (little-endian, via exifr)', () => {
  it('resets Orientation to 1', async () => {
    const tiff = fullTiff()
    const before = await parse(tiff)
    expect(before['Orientation']).toBe(6)
    setOrientation(tiff, 1)
    const after = await parse(tiff)
    expect(after['Orientation']).toBe(1)
  })

  it('rewrites the pixel dimensions in place', async () => {
    const tiff = fullTiff()
    setPixelDimensions(tiff, { width: 1200, height: 900 })
    const fields = await parse(tiff)
    expect(fields['ExifImageWidth']).toBe(1200)
    expect(fields['ExifImageHeight']).toBe(900)
  })

  it('removes the GPS location so a reader finds none', async () => {
    const tiff = fullTiff()
    const before = await parse(tiff)
    expect(before['latitude']).toBeDefined()
    removeLocation(tiff)
    const after = await parse(tiff)
    expect(after['latitude']).toBeUndefined()
  })

  it('reads the print density', () => {
    expect(readDensity(fullTiff())).toEqual({ x: 300, y: 300, unit: 'inch' })
  })
})

/** A minimal big-endian ("MM") TIFF: IFD0 with Orientation and a GPS pointer. */
function bigEndianTiff(): Uint8Array {
  // prettier-ignore
  return new Uint8Array([
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // MM, magic 42, IFD0 @ 8
    0x00, 0x02, // two entries
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00, // Orientation = 6
    0x88, 0x25, 0x00, 0x04, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x26, // GPS IFD @ 0x26
    0x00, 0x00, 0x00, 0x00, // no next IFD
    0x00, 0x01, // GPS IFD: one entry
    0x00, 0x02, 0x00, 0x05, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00, 0x40, // GPSLatitude ptr
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ])
}

describe('exif-edit (big-endian, by bytes)', () => {
  it('resets Orientation and zeroes the GPS pointer and IFD count', () => {
    const tiff = bigEndianTiff()
    setOrientation(tiff, 1)
    removeLocation(tiff)
    const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength)
    // Orientation entry value field is at IFD0 (8) + count (2) + 8.
    expect(view.getUint16(18, false)).toBe(1)
    // GPS pointer value field is at IFD0 (8) + count (2) + entry (12) + 8.
    expect(view.getUint32(30, false)).toBe(0)
    // GPS IFD entry count at offset 0x26.
    expect(view.getUint16(0x26, false)).toBe(0)
  })
})
