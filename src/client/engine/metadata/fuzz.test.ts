import { describe, expect, it } from 'vitest'

import { readDensity, removeLocation, setOrientation, setPixelDimensions } from './exif-edit'
import { extractJpegMetadata, extractPngMetadata, insertPngChunks, physChunkData } from './segments'
import { buildExifTiff, jpegContainer, minimalPng } from '../../test-support/exif-fixtures'
import { mulberry32 } from '../random'

const ITERATIONS = 200
const FUZZ_SEED = 0x5f_3a_c1_09
const BYTE_VALUES = 256

function mutate(source: Uint8Array, random: () => number): Uint8Array {
  const copy = new Uint8Array(source)
  const flips = 1 + Math.floor(random() * 4)
  for (let flip = 0; flip < flips; flip += 1) {
    const index = Math.floor(random() * copy.length)
    copy[index] = Math.floor(random() * BYTE_VALUES)
  }
  return copy
}

describe('metadata scanners never throw on malformed input', () => {
  it('survives 200 random mutations of a JPEG with EXIF', () => {
    const jpeg = jpegContainer({
      tiff: buildExifTiff({
        make: 'Canon',
        model: 'EOS',
        orientation: 6,
        gps: { latitude: [51, 30, 27], longitude: [0, 7, 40], latitudeRef: 'N', longitudeRef: 'W' },
      }),
      xmp: new TextEncoder().encode('<x:xmpmeta/>'),
      density: { x: 300, y: 300, unit: 'inch' },
    })
    const random = mulberry32(FUZZ_SEED)
    expect(() => {
      for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
        const bytes = mutate(jpeg, random)
        const raw = extractJpegMetadata(bytes)
        if (raw.exif !== null) {
          setOrientation(raw.exif, 1)
          setPixelDimensions(raw.exif, { width: 100, height: 100 })
          removeLocation(raw.exif)
          readDensity(raw.exif)
        }
      }
    }).not.toThrow()
  })

  it('survives 200 random mutations of a PNG with metadata', () => {
    const png = insertPngChunks(minimalPng(), [
      { type: 'eXIf', data: buildExifTiff({ make: 'Canon' }) },
      { type: 'pHYs', data: physChunkData({ x: 300, y: 300, unit: 'inch' }) },
    ])
    const random = mulberry32(FUZZ_SEED ^ 0x12_34)
    expect(() => {
      for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
        extractPngMetadata(mutate(png, random))
      }
    }).not.toThrow()
  })
})
