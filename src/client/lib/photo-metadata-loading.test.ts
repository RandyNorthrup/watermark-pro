import { expect, it, vi } from 'vitest'

import { readPhotoMetadata } from './photo-metadata'
import { buildExifTiff, jpegContainer } from '../test-support/exif-fixtures'

const parser = vi.hoisted(() => ({ loaded: vi.fn(), parse: vi.fn() }))
vi.mock('exifr', () => {
  parser.loaded()
  return { parse: parser.parse }
})

it('loads the EXIF parser only for a selected file and retains raw metadata on parse failure', async () => {
  expect(parser.loaded).not.toHaveBeenCalled()
  parser.parse.mockResolvedValueOnce({ Model: 'Selected camera' })
  const jpeg = jpegContainer({ tiff: buildExifTiff({ model: 'Selected camera' }) })
  const file = new File([jpeg] as BlobPart[], 'selected.jpg', { type: 'image/jpeg' })
  const first = await readPhotoMetadata(file)
  expect(first.camera).toBe('Selected camera')
  expect(parser.loaded).toHaveBeenCalledOnce()
  expect(parser.parse).toHaveBeenCalledOnce()

  parser.parse.mockRejectedValueOnce(new Error('corrupt camera fields'))
  const result = await readPhotoMetadata(file)
  expect(result.camera).toBeNull()
  expect(result.exif).not.toBeNull()
  expect(parser.loaded).toHaveBeenCalledOnce()
})
