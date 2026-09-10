import { expect, it, vi } from 'vitest'

import { readPhotoMetadata } from './photo-metadata'
import { buildExifTiff, jpegContainer } from '../test-support/exif-fixtures'

vi.mock('exifr', () => {
  throw new Error('EXIF parser download unavailable')
})

it('rejects a parser module failure instead of reporting an empty successful metadata read', async () => {
  const jpeg = jpegContainer({ tiff: buildExifTiff({ model: 'Readable camera' }) })
  const file = new File([jpeg] as BlobPart[], 'readable.jpg', { type: 'image/jpeg' })
  await expect(readPhotoMetadata(file)).rejects.toThrow()
})
