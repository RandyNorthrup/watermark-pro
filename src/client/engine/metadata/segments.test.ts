import { describe, expect, it } from 'vitest'

import { crc32 } from './crc32'
import {
  app1Segment,
  EXIF_IDENTIFIER,
  extractJpegMetadata,
  extractPngMetadata,
  insertJpegSegments,
  insertPngChunks,
  jfifSegment,
  jpegSegments,
  physChunkData,
  pngChunks,
  xmpItxtData,
} from './segments'
import { buildExifTiff, jpegContainer, minimalPng } from '../../test-support/exif-fixtures'

const XMP = new TextEncoder().encode('<x:xmpmeta>test</x:xmpmeta>')

function isSameBytes(a: Uint8Array | null, b: Uint8Array): boolean {
  return a !== null && a.length === b.length && a.every((value, index) => value === b[index])
}

describe('jpegSegments', () => {
  it('walks APP0, APP1 Exif, APP1 XMP and stops at SOS', () => {
    const tiff = buildExifTiff({ make: 'Canon', model: 'EOS' })
    const jpeg = jpegContainer({ tiff, xmp: XMP, density: { x: 300, y: 300, unit: 'inch' } })
    const markers = jpegSegments(jpeg).map((segment) => segment.marker)
    expect(markers).toEqual([0xff_e0, 0xff_e1, 0xff_e1, 0xff_da])
  })

  it('returns nothing for a non-JPEG', () => {
    expect(jpegSegments(new Uint8Array([1, 2, 3, 4]))).toEqual([])
  })
})

describe('extractJpegMetadata', () => {
  it('pulls the Exif, XMP and density payloads', () => {
    const tiff = buildExifTiff({ make: 'Canon', model: 'EOS', xResolution: 240, yResolution: 240 })
    const jpeg = jpegContainer({ tiff, xmp: XMP, density: { x: 300, y: 300, unit: 'inch' } })
    const raw = extractJpegMetadata(jpeg)
    expect(isSameBytes(raw.exif, tiff)).toBe(true)
    expect(isSameBytes(raw.xmp, XMP)).toBe(true)
    expect(raw.density).toEqual({ x: 300, y: 300, unit: 'inch' })
  })
})

describe('insertJpegSegments', () => {
  it('places the JFIF APP0 before the Exif APP1', () => {
    const base = jpegContainer({})
    const tiff = buildExifTiff({ make: 'Canon' })
    const result = insertJpegSegments(base, [
      jfifSegment({ x: 300, y: 300, unit: 'inch' }),
      app1Segment(EXIF_IDENTIFIER, tiff),
    ])
    const markers = jpegSegments(result).map((segment) => segment.marker)
    expect(markers[0]).toBe(0xff_e0)
    expect(markers[1]).toBe(0xff_e1)
  })
})

describe('pngChunks and extractPngMetadata', () => {
  it('inserts and reads eXIf, iTXt XMP and pHYs after IHDR', () => {
    const tiff = buildExifTiff({ make: 'Canon', model: 'EOS' })
    const png = insertPngChunks(minimalPng(), [
      { type: 'eXIf', data: tiff },
      { type: 'iTXt', data: xmpItxtData(XMP) },
      { type: 'pHYs', data: physChunkData({ x: 300, y: 300, unit: 'inch' }) },
    ])
    const types = pngChunks(png).map((chunk) => chunk.type)
    expect(types).toEqual(['IHDR', 'eXIf', 'iTXt', 'pHYs', 'IDAT', 'IEND'])
    const raw = extractPngMetadata(png)
    expect(isSameBytes(raw.exif, tiff)).toBe(true)
    expect(isSameBytes(raw.xmp, XMP)).toBe(true)
    expect(raw.density?.x).toBeCloseTo(300, 0)
  })

  it('writes a correct CRC for each inserted chunk', () => {
    const png = insertPngChunks(minimalPng(), [
      { type: 'pHYs', data: physChunkData({ x: 300, y: 300, unit: 'inch' }) },
    ])
    const chunk = pngChunks(png).find((entry) => entry.type === 'pHYs')
    expect(chunk).toBeDefined()
    if (chunk === undefined) {
      return
    }
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
    const storedCrc = view.getUint32(chunk.dataStart + chunk.dataLength, false)
    const crcInput = png.slice(chunk.start + 4, chunk.dataStart + chunk.dataLength)
    expect(storedCrc).toBe(crc32(crcInput))
  })
})
