/**
 * Reads a photo's metadata in the browser, once, when it is opened or added to
 * a batch. Camera fields come from `exifr`; the raw Exif/XMP/density bytes come
 * from our own segment scanner (`engine/metadata/segments.ts`) because exifr
 * does not return them. Nothing is ever uploaded for this, and the function
 * never throws: a file with no EXIF or a corrupt block yields all-null fields.
 */
import { parse as parseExif } from 'exifr'

import { EMPTY_PHOTO_METADATA, type PhotoMetadata } from '../../shared/metadata'
import { extractJpegMetadata, extractPngMetadata } from '../engine/metadata/segments'

/** exifr blocks we read; values stay numeric (`translateValues: false`) so Orientation is a number. */
const EXIFR_OPTIONS = {
  tiff: true,
  exif: true,
  gps: true,
  jfif: true,
  xmp: false,
  iptc: false,
  icc: false,
  translateKeys: true,
  translateValues: false,
  reviveValues: true,
  mergeOutput: true,
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function numberField(fields: Record<string, unknown>, key: string): number | null {
  const value = fields[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function stringField(fields: Record<string, unknown>, key: string): string | null {
  const value = fields[key]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function dateField(fields: Record<string, unknown>, key: string): Date | null {
  const value = fields[key]
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value : null
}

/** "Make Model", dropping Make when Model already begins with it. */
function cameraName(make: string | null, model: string | null): string | null {
  if (model === null) {
    return make
  }
  if (make === null || model.toLowerCase().startsWith(make.toLowerCase())) {
    return model
  }
  return `${make} ${model}`
}

function locationOf(fields: Record<string, unknown>): PhotoMetadata['location'] {
  const latitude = numberField(fields, 'latitude')
  const longitude = numberField(fields, 'longitude')
  return latitude === null || longitude === null ? null : { latitude, longitude }
}

export async function readPhotoMetadata(file: File): Promise<PhotoMetadata> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const raw = file.type === 'image/png' ? extractPngMetadata(bytes) : extractJpegMetadata(bytes)

  let parsed: unknown
  try {
    parsed = await parseExif(bytes, EXIFR_OPTIONS)
  } catch {
    parsed = null
  }
  if (!isRecord(parsed)) {
    return { ...EMPTY_PHOTO_METADATA, exif: raw.exif, xmp: raw.xmp, density: raw.density }
  }

  return {
    takenAt: dateField(parsed, 'DateTimeOriginal') ?? dateField(parsed, 'CreateDate'),
    camera: cameraName(stringField(parsed, 'Make'), stringField(parsed, 'Model')),
    lens: stringField(parsed, 'LensModel') ?? stringField(parsed, 'LensMake'),
    iso: numberField(parsed, 'ISO'),
    aperture: numberField(parsed, 'FNumber'),
    shutter: numberField(parsed, 'ExposureTime'),
    focalLength: numberField(parsed, 'FocalLength'),
    location: locationOf(parsed),
    orientation: numberField(parsed, 'Orientation'),
    density: raw.density,
    exif: raw.exif,
    xmp: raw.xmp,
  }
}
