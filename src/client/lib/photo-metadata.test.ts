import { describe, expect, it } from 'vitest'

import { readPhotoMetadata } from './photo-metadata'
import { buildExifTiff, jpegContainer } from '../test-support/exif-fixtures'

/**
 * A full camera fixture: make/model, lens, the exposure triangle, a capture
 * date, a GPS position and a 300 dpi density, wrapped in a metadata-only JPEG
 * that exifr parses.
 */
function cameraJpeg(): File {
  const tiff = buildExifTiff({
    make: 'Canon',
    model: 'Canon EOS R6',
    lens: 'RF24-70mm F2.8 L IS USM',
    iso: 400,
    exposureTime: [1, 250],
    fNumber: [28, 10],
    focalLength: [50, 1],
    dateTimeOriginal: '2026:07:15 14:30:00',
    xResolution: 300,
    yResolution: 300,
    orientation: 6,
    gps: {
      latitude: [51, 30, 27],
      longitude: [0, 7, 40],
      latitudeRef: 'N',
      longitudeRef: 'W',
    },
  })
  const jpeg = jpegContainer({ tiff, density: { x: 300, y: 300, unit: 'inch' } })
  return new File([jpeg] as BlobPart[], 'photo.jpg', { type: 'image/jpeg' })
}

describe('readPhotoMetadata', () => {
  it('reads camera, exposure, capture date, GPS and density from a JPEG', async () => {
    const metadata = await readPhotoMetadata(cameraJpeg())
    expect(metadata.camera).toBe('Canon EOS R6')
    expect(metadata.lens).toBe('RF24-70mm F2.8 L IS USM')
    expect(metadata.iso).toBe(400)
    expect(metadata.aperture).toBeCloseTo(2.8, 2)
    expect(metadata.shutter).toBeCloseTo(1 / 250, 5)
    expect(metadata.focalLength).toBe(50)
    expect(metadata.takenAt).toBeInstanceOf(Date)
    expect(metadata.orientation).toBe(6)
    expect(metadata.location?.latitude).toBeCloseTo(51.5075, 3)
    expect(metadata.location?.longitude).toBeCloseTo(-0.1278, 3)
    expect(metadata.density).toEqual({ x: 300, y: 300, unit: 'inch' })
    expect(metadata.exif).not.toBeNull()
  })

  it('joins make and model when the model does not repeat the make', async () => {
    const tiff = buildExifTiff({ make: 'NIKON CORPORATION', model: 'D850' })
    const file = new File([jpegContainer({ tiff })] as BlobPart[], 'n.jpg', { type: 'image/jpeg' })
    const metadata = await readPhotoMetadata(file)
    expect(metadata.camera).toBe('NIKON CORPORATION D850')
    expect(metadata.location).toBeNull()
  })

  it('uses the model alone when there is no make', async () => {
    const tiff = buildExifTiff({ model: 'D850' })
    const file = new File([jpegContainer({ tiff })] as BlobPart[], 'm.jpg', { type: 'image/jpeg' })
    const metadata = await readPhotoMetadata(file)
    expect(metadata.camera).toBe('D850')
  })

  it('returns all-null fields for a file with no EXIF', async () => {
    const plain = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], 'plain.jpg', {
      type: 'image/jpeg',
    })
    const metadata = await readPhotoMetadata(plain)
    expect(metadata.camera).toBeNull()
    expect(metadata.location).toBeNull()
    expect(metadata.exif).toBeNull()
  })
})
