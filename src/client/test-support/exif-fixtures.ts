/**
 * Hand-built EXIF fixtures for the metadata tests. Builds a little-endian TIFF
 * block with an IFD0, an Exif sub-IFD and (optionally) a GPS IFD, then wraps it
 * in a minimal JPEG or PNG that `exifr` and our own scanners both read. The
 * JPEG/PNG here are metadata containers, not decodable images; browser tests
 * that need a real image splice this metadata into a canvas-encoded file.
 */

const TYPE_ASCII = 2
const TYPE_SHORT = 3
const TYPE_LONG = 4
const TYPE_RATIONAL = 5

const TAG_MAKE = 0x01_0f
const TAG_MODEL = 0x01_10
const TAG_ORIENTATION = 0x01_12
const TAG_X_RESOLUTION = 0x01_1a
const TAG_Y_RESOLUTION = 0x01_1b
const TAG_RESOLUTION_UNIT = 0x01_28
const TAG_EXIF_IFD = 0x87_69
const TAG_GPS_IFD = 0x88_25
const TAG_EXPOSURE_TIME = 0x82_9a
const TAG_F_NUMBER = 0x82_9d
const TAG_ISO = 0x88_27
const TAG_DATE_TIME_ORIGINAL = 0x90_03
const TAG_FOCAL_LENGTH = 0x92_0a
const TAG_LENS_MODEL = 0xa4_34
const TAG_PIXEL_X = 0xa0_02
const TAG_PIXEL_Y = 0xa0_03
const TAG_GPS_LAT_REF = 0x00_01
const TAG_GPS_LAT = 0x00_02
const TAG_GPS_LNG_REF = 0x00_03
const TAG_GPS_LNG = 0x00_04

const IFD_ENTRY_SIZE = 12
const IFD_COUNT_SIZE = 2
const NEXT_IFD_SIZE = 4
const VALUE_FIELD_SIZE = 4
/** Offset of the value/offset field within a 12-byte IFD entry. */
const VALUE_FIELD_OFFSET = 8
const TIFF_HEADER_SIZE = 8
const RESOLUTION_UNIT_INCH = 2
const BYTE_MASK = 0xff
const BYTE_BITS = 8
/** Denominator for the fractional seconds of a GPS coordinate. */
const SECONDS_PRECISION = 100

export interface GpsFixture {
  latitude: [number, number, number]
  longitude: [number, number, number]
  latitudeRef: 'N' | 'S'
  longitudeRef: 'E' | 'W'
}

export interface ExifFixture {
  orientation?: number
  make?: string
  model?: string
  lens?: string
  iso?: number
  exposureTime?: [number, number]
  fNumber?: [number, number]
  focalLength?: [number, number]
  dateTimeOriginal?: string
  xResolution?: number
  yResolution?: number
  pixelWidth?: number
  pixelHeight?: number
  gps?: GpsFixture
}

interface Field {
  tag: number
  type: number
  /** Element values: chars for ASCII, [num, den, …] for RATIONAL. */
  data: number[]
}

function asciiField(tag: number, text: string): Field {
  const data = [...new TextEncoder().encode(text), 0]
  return { tag, type: TYPE_ASCII, data }
}

function elementSize(type: number): number {
  if (type === TYPE_SHORT) {
    return 2
  }
  if (type === TYPE_LONG) {
    return VALUE_FIELD_SIZE
  }
  if (type === TYPE_RATIONAL) {
    return 8
  }
  return 1
}

function fieldCount(field: Field): number {
  return field.type === TYPE_RATIONAL ? field.data.length / 2 : field.data.length
}

function fieldBytes(field: Field): number {
  return elementSize(field.type) * fieldCount(field)
}

/** Serialises a field's raw value bytes (little-endian), for the external pool. */
function valueBytes(field: Field): number[] {
  const out: number[] = []
  if (field.type === TYPE_ASCII) {
    for (const value of field.data) {
      out.push(value & BYTE_MASK)
    }
  } else if (field.type === TYPE_SHORT) {
    for (const value of field.data) {
      out.push(value & BYTE_MASK, (value >> BYTE_BITS) & BYTE_MASK)
    }
  } else {
    for (const value of field.data) {
      out.push(
        value & BYTE_MASK,
        (value >> BYTE_BITS) & BYTE_MASK,
        (value >> 16) & BYTE_MASK,
        (value >>> 24) & BYTE_MASK,
      )
    }
  }
  return out
}

interface Ifd {
  fields: Field[]
  /** Where this IFD's 12-byte entry block begins in the TIFF. */
  offset: number
}

/** A camera Exif block: orientation 6, a 4000×3000 frame and a London GPS position. */
export function sampleExif(): Uint8Array {
  return buildExifTiff({
    orientation: 6,
    pixelWidth: 4000,
    pixelHeight: 3000,
    gps: { latitude: [51, 30, 27], longitude: [0, 7, 40], latitudeRef: 'N', longitudeRef: 'W' },
  })
}

/**
 * Lays out IFDs at fixed offsets and appends their oversized values to a shared
 * external pool, then writes the entry tables. Pointer fields (Exif/GPS) are
 * patched with the target IFD offsets.
 */
export function buildExifTiff(fixture: ExifFixture): Uint8Array {
  const ifd0: Field[] = []
  if (fixture.make !== undefined) {
    ifd0.push(asciiField(TAG_MAKE, fixture.make))
  }
  if (fixture.model !== undefined) {
    ifd0.push(asciiField(TAG_MODEL, fixture.model))
  }
  ifd0.push(
    { tag: TAG_ORIENTATION, type: TYPE_SHORT, data: [fixture.orientation ?? 1] },
    { tag: TAG_X_RESOLUTION, type: TYPE_RATIONAL, data: [fixture.xResolution ?? 72, 1] },
    { tag: TAG_Y_RESOLUTION, type: TYPE_RATIONAL, data: [fixture.yResolution ?? 72, 1] },
    { tag: TAG_RESOLUTION_UNIT, type: TYPE_SHORT, data: [RESOLUTION_UNIT_INCH] },
  )

  const exif: Field[] = []
  if (fixture.iso !== undefined) {
    exif.push({ tag: TAG_ISO, type: TYPE_SHORT, data: [fixture.iso] })
  }
  if (fixture.exposureTime !== undefined) {
    exif.push({ tag: TAG_EXPOSURE_TIME, type: TYPE_RATIONAL, data: fixture.exposureTime })
  }
  if (fixture.fNumber !== undefined) {
    exif.push({ tag: TAG_F_NUMBER, type: TYPE_RATIONAL, data: fixture.fNumber })
  }
  if (fixture.focalLength !== undefined) {
    exif.push({ tag: TAG_FOCAL_LENGTH, type: TYPE_RATIONAL, data: fixture.focalLength })
  }
  if (fixture.dateTimeOriginal !== undefined) {
    exif.push(asciiField(TAG_DATE_TIME_ORIGINAL, fixture.dateTimeOriginal))
  }
  if (fixture.lens !== undefined) {
    exif.push(asciiField(TAG_LENS_MODEL, fixture.lens))
  }
  if (fixture.pixelWidth !== undefined) {
    exif.push({ tag: TAG_PIXEL_X, type: TYPE_LONG, data: [fixture.pixelWidth] })
  }
  if (fixture.pixelHeight !== undefined) {
    exif.push({ tag: TAG_PIXEL_Y, type: TYPE_LONG, data: [fixture.pixelHeight] })
  }

  const gps: Field[] = []
  if (fixture.gps !== undefined) {
    gps.push(
      asciiField(TAG_GPS_LAT_REF, fixture.gps.latitudeRef),
      { tag: TAG_GPS_LAT, type: TYPE_RATIONAL, data: ratios(fixture.gps.latitude) },
      asciiField(TAG_GPS_LNG_REF, fixture.gps.longitudeRef),
      { tag: TAG_GPS_LNG, type: TYPE_RATIONAL, data: ratios(fixture.gps.longitude) },
    )
  }

  // IFD0 carries pointer entries to the Exif and (if present) GPS IFDs.
  ifd0.push({ tag: TAG_EXIF_IFD, type: TYPE_LONG, data: [0] })
  const hasGps = gps.length > 0
  if (hasGps) {
    ifd0.push({ tag: TAG_GPS_IFD, type: TYPE_LONG, data: [0] })
  }

  const ifds: Ifd[] = []
  const groups = hasGps ? [ifd0, exif, gps] : [ifd0, exif]
  let offset = TIFF_HEADER_SIZE
  for (const fields of groups) {
    ifds.push({ fields, offset })
    offset += IFD_COUNT_SIZE + fields.length * IFD_ENTRY_SIZE + NEXT_IFD_SIZE
  }
  setPointer(ifd0, TAG_EXIF_IFD, ifds[1]?.offset ?? 0)
  if (hasGps) {
    setPointer(ifd0, TAG_GPS_IFD, ifds[2]?.offset ?? 0)
  }
  // The external value pool starts after every IFD entry table.
  return assemble(ifds, offset)
}

function ratios(parts: [number, number, number]): number[] {
  return [parts[0], 1, parts[1], 1, Math.round(parts[2] * SECONDS_PRECISION), SECONDS_PRECISION]
}

function setPointer(fields: Field[], tag: number, value: number): void {
  const field = fields.find((entry) => entry.tag === tag)
  if (field !== undefined) {
    field.data = [value]
  }
}

function offsetWithExternals(ifds: Ifd[]): number {
  let size = ifds.reduce(
    (sum, ifd) => sum + IFD_COUNT_SIZE + ifd.fields.length * IFD_ENTRY_SIZE + NEXT_IFD_SIZE,
    TIFF_HEADER_SIZE,
  )
  for (const ifd of ifds) {
    for (const field of ifd.fields) {
      if (fieldBytes(field) > VALUE_FIELD_SIZE) {
        size += fieldBytes(field)
      }
    }
  }
  return size
}

function writeHeader(bytes: Uint8Array): void {
  bytes[0] = 0x49
  bytes[1] = 0x49
  bytes[2] = 0x2a
  bytes[3] = 0x00
  bytes[4] = TIFF_HEADER_SIZE
}

/** Writes the header, every IFD entry table, and the external value pool. */
function assemble(ifds: Ifd[], externalStart: number): Uint8Array {
  const total = new Uint8Array(offsetWithExternals(ifds))
  writeHeader(total)
  let cursor = externalStart
  for (const ifd of ifds) {
    writeU16(total, ifd.offset, ifd.fields.length)
    let entryAt = ifd.offset + IFD_COUNT_SIZE
    for (const field of ifd.fields) {
      writeU16(total, entryAt, field.tag)
      writeU16(total, entryAt + 2, field.type)
      writeU32(total, entryAt + 4, fieldCount(field))
      const bytes = valueBytes(field)
      if (bytes.length <= VALUE_FIELD_SIZE) {
        for (const [index, byte] of bytes.entries()) {
          total[entryAt + VALUE_FIELD_OFFSET + index] = byte
        }
      } else {
        writeU32(total, entryAt + VALUE_FIELD_OFFSET, cursor)
        for (const [index, byte] of bytes.entries()) {
          total[cursor + index] = byte
        }
        cursor += bytes.length
      }
      entryAt += IFD_ENTRY_SIZE
    }
    // next-IFD offset stays 0
  }
  return total
}

function writeU16(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & BYTE_MASK
  bytes[offset + 1] = (value >> BYTE_BITS) & BYTE_MASK
}

function writeU32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & BYTE_MASK
  bytes[offset + 1] = (value >> BYTE_BITS) & BYTE_MASK
  bytes[offset + 2] = (value >> 16) & BYTE_MASK
  bytes[offset + 3] = (value >>> 24) & BYTE_MASK
}

/** JPEG APP0/APP1 container for the segment tests: SOI, JFIF density, Exif, XMP, SOS, EOI. */
export function jpegContainer(options: {
  tiff?: Uint8Array
  xmp?: Uint8Array
  density?: { x: number; y: number; unit: 'inch' | 'cm' }
}): Uint8Array {
  const parts: number[] = [0xff, 0xd8] // SOI
  if (options.density !== undefined) {
    parts.push(...jfifApp0(options.density))
  }
  if (options.tiff !== undefined) {
    parts.push(...app1(exifIdentifier(), options.tiff))
  }
  if (options.xmp !== undefined) {
    parts.push(...app1(xmpIdentifier(), options.xmp))
  }
  // SOS with an empty header (no scan data), then EOI
  parts.push(0xff, 0xda, 0x00, 0x02, 0xff, 0xd9)
  return new Uint8Array(parts)
}

function exifIdentifier(): number[] {
  return [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]
}

function xmpIdentifier(): number[] {
  // The XMP APP1 identifier is literally this http URI, fixed by the Adobe spec.
  // eslint-disable-next-line unicorn/prefer-https
  return [...new TextEncoder().encode('http://ns.adobe.com/xap/1.0/\0')]
}

function app1(identifier: number[], payload: Uint8Array): number[] {
  const body = [...identifier, ...payload]
  const length = body.length + 2
  return [0xff, 0xe1, (length >> BYTE_BITS) & BYTE_MASK, length & BYTE_MASK, ...body]
}

/** A raw PNG chunk with a zero CRC (walkers here do not validate the CRC). */
function pngChunkRaw(type: string, data: number[]): number[] {
  const typeBytes = [...new TextEncoder().encode(type)]
  const length = data.length
  return [
    (length >>> 24) & BYTE_MASK,
    (length >> 16) & BYTE_MASK,
    (length >> BYTE_BITS) & BYTE_MASK,
    length & BYTE_MASK,
    ...typeBytes,
    ...data,
    0,
    0,
    0,
    0, // CRC placeholder
  ]
}

/** A 1×1 PNG with only IHDR/IDAT/IEND, for the insertion tests. */
export function minimalPng(): Uint8Array {
  return new Uint8Array([
    137,
    80,
    78,
    71,
    13,
    10,
    26,
    10, // signature
    ...pngChunkRaw('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]),
    ...pngChunkRaw('IDAT', []),
    ...pngChunkRaw('IEND', []),
  ])
}

function jfifApp0(density: { x: number; y: number; unit: 'inch' | 'cm' }): number[] {
  const units = density.unit === 'cm' ? 2 : 1
  const body = [
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00, // "JFIF\0"
    1,
    2, // version 1.2
    units,
    (density.x >> BYTE_BITS) & BYTE_MASK,
    density.x & BYTE_MASK,
    (density.y >> BYTE_BITS) & BYTE_MASK,
    density.y & BYTE_MASK,
    0,
    0, // no thumbnail
  ]
  const length = body.length + 2
  return [0xff, 0xe0, (length >> BYTE_BITS) & BYTE_MASK, length & BYTE_MASK, ...body]
}
