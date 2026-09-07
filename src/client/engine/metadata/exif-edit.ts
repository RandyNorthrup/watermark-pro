/**
 * In-place edits of a TIFF/Exif payload, both byte orders. The bytes are never
 * moved, so every other offset in the block stays valid: we only overwrite
 * fixed-size fields (orientation, pixel dimensions) and zero the GPS IFD.
 * Field reading for `readDensity` is here too. Every offset is bounds-checked;
 * an unparsable block makes each function a no-op (or returns null).
 */
import type { PrintDensity } from '../../../shared/metadata'

const LITTLE_ENDIAN_MARK = 0x49_49 // "II"
const BIG_ENDIAN_MARK = 0x4d_4d // "MM"
const TIFF_MAGIC = 42
const TIFF_HEADER = 8
const IFD_ENTRY_SIZE = 12
const IFD_COUNT_SIZE = 2
const VALUE_FIELD_OFFSET = 8
const VALUE_FIELD_SIZE = 4

const TYPE_SHORT = 3
const TYPE_LONG = 4
const TYPE_RATIONAL = 5
const RATIONAL_SIZE = 8

const TAG_ORIENTATION = 0x01_12
const TAG_X_RESOLUTION = 0x01_1a
const TAG_Y_RESOLUTION = 0x01_1b
const TAG_RESOLUTION_UNIT = 0x01_28
const TAG_EXIF_IFD = 0x87_69
const TAG_GPS_IFD = 0x88_25
const TAG_PIXEL_X = 0xa0_02
const TAG_PIXEL_Y = 0xa0_03
const RESOLUTION_UNIT_CM = 3

/** Byte size of one element of a TIFF field type; 0 for types we do not size. */
function typeSize(type: number): number {
  if (type === TYPE_SHORT) {
    return 2
  }
  if (type === TYPE_LONG) {
    return VALUE_FIELD_SIZE
  }
  if (type === TYPE_RATIONAL) {
    return RATIONAL_SIZE
  }
  return 1
}

interface TiffContext {
  view: DataView
  isLittleEndian: boolean
  ifd0: number
  length: number
}

interface TagEntry {
  type: number
  count: number
  /** Offset of the 4-byte value/offset field within the TIFF. */
  fieldOffset: number
  /** Offset of the value bytes (the field itself when inline, else the pointee). */
  valueOffset: number
}

/** Parses the TIFF header; null when the block is not a valid little- or big-endian TIFF. */
export function readIfd0(tiff: Uint8Array): TiffContext | null {
  if (tiff.length < TIFF_HEADER) {
    return null
  }
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength)
  const mark = view.getUint16(0, false)
  let isLittleEndian: boolean
  if (mark === LITTLE_ENDIAN_MARK) {
    isLittleEndian = true
  } else if (mark === BIG_ENDIAN_MARK) {
    isLittleEndian = false
  } else {
    return null
  }
  if (view.getUint16(2, isLittleEndian) !== TIFF_MAGIC) {
    return null
  }
  const ifd0 = view.getUint32(4, isLittleEndian)
  if (ifd0 + IFD_COUNT_SIZE > tiff.length) {
    return null
  }
  return { view, isLittleEndian, ifd0, length: tiff.length }
}

function findTag(ctx: TiffContext, ifdOffset: number, tag: number): TagEntry | null {
  if (ifdOffset + IFD_COUNT_SIZE > ctx.length) {
    return null
  }
  const count = ctx.view.getUint16(ifdOffset, ctx.isLittleEndian)
  for (let index = 0; index < count; index += 1) {
    const entryOffset = ifdOffset + IFD_COUNT_SIZE + index * IFD_ENTRY_SIZE
    if (entryOffset + IFD_ENTRY_SIZE > ctx.length) {
      break
    }
    if (ctx.view.getUint16(entryOffset, ctx.isLittleEndian) !== tag) {
      continue
    }
    const type = ctx.view.getUint16(entryOffset + 2, ctx.isLittleEndian)
    const elements = ctx.view.getUint32(entryOffset + 4, ctx.isLittleEndian)
    const fieldOffset = entryOffset + VALUE_FIELD_OFFSET
    const byteSize = typeSize(type) * elements
    const valueOffset =
      byteSize <= VALUE_FIELD_SIZE
        ? fieldOffset
        : ctx.view.getUint32(fieldOffset, ctx.isLittleEndian)
    return { type, count: elements, fieldOffset, valueOffset }
  }
  return null
}

/** Writes a SHORT or LONG value into a tag's inline field, if the tag exists. */
function writeScalar(ctx: TiffContext, ifdOffset: number, tag: number, value: number): void {
  const entry = findTag(ctx, ifdOffset, tag)
  if (entry === null) {
    return
  }
  if (entry.type === TYPE_SHORT) {
    ctx.view.setUint16(entry.fieldOffset, value, ctx.isLittleEndian)
  } else if (entry.type === TYPE_LONG) {
    ctx.view.setUint32(entry.fieldOffset, value, ctx.isLittleEndian)
  }
}

/** Resets the Orientation tag to `value` (1 for upright), in place. */
export function setOrientation(tiff: Uint8Array, value: number): void {
  const ctx = readIfd0(tiff)
  if (ctx === null) {
    return
  }
  writeScalar(ctx, ctx.ifd0, TAG_ORIENTATION, value)
}

/** Rewrites PixelXDimension / PixelYDimension (in the Exif sub-IFD) to the output size. */
export function setPixelDimensions(
  tiff: Uint8Array,
  size: { width: number; height: number },
): void {
  const ctx = readIfd0(tiff)
  if (ctx === null) {
    return
  }
  const exifPointer = findTag(ctx, ctx.ifd0, TAG_EXIF_IFD)
  if (exifPointer === null) {
    return
  }
  const exifIfd = ctx.view.getUint32(exifPointer.fieldOffset, ctx.isLittleEndian)
  writeScalar(ctx, exifIfd, TAG_PIXEL_X, size.width)
  writeScalar(ctx, exifIfd, TAG_PIXEL_Y, size.height)
}

/**
 * Empties the GPS IFD: zeroes its entries, sets its entry count to 0, and
 * zeroes the IFD0 pointer so a reader never follows it. Offsets elsewhere are
 * untouched.
 */
export function removeLocation(tiff: Uint8Array): void {
  const ctx = readIfd0(tiff)
  if (ctx === null) {
    return
  }
  const pointer = findTag(ctx, ctx.ifd0, TAG_GPS_IFD)
  if (pointer === null) {
    return
  }
  const gpsIfd = ctx.view.getUint32(pointer.fieldOffset, ctx.isLittleEndian)
  if (gpsIfd + IFD_COUNT_SIZE <= ctx.length) {
    const entries = ctx.view.getUint16(gpsIfd, ctx.isLittleEndian)
    for (let index = 0; index < entries; index += 1) {
      const entryOffset = gpsIfd + IFD_COUNT_SIZE + index * IFD_ENTRY_SIZE
      if (entryOffset + IFD_ENTRY_SIZE > ctx.length) {
        break
      }
      for (let byte = 0; byte < IFD_ENTRY_SIZE; byte += 1) {
        tiff[entryOffset + byte] = 0
      }
    }
    ctx.view.setUint16(gpsIfd, 0, ctx.isLittleEndian)
  }
  ctx.view.setUint32(pointer.fieldOffset, 0, ctx.isLittleEndian)
}

function readRational(ctx: TiffContext, tag: number): number | null {
  const entry = findTag(ctx, ctx.ifd0, tag)
  if (entry?.type !== TYPE_RATIONAL || entry.valueOffset + RATIONAL_SIZE > ctx.length) {
    return null
  }
  const numerator = ctx.view.getUint32(entry.valueOffset, ctx.isLittleEndian)
  const denominator = ctx.view.getUint32(entry.valueOffset + VALUE_FIELD_SIZE, ctx.isLittleEndian)
  return denominator === 0 ? null : numerator / denominator
}

/** Print density from the Exif resolution tags, or null when absent. */
export function readDensity(tiff: Uint8Array): PrintDensity | null {
  const ctx = readIfd0(tiff)
  if (ctx === null) {
    return null
  }
  const x = readRational(ctx, TAG_X_RESOLUTION)
  const y = readRational(ctx, TAG_Y_RESOLUTION)
  if (x === null || y === null) {
    return null
  }
  const unitEntry = findTag(ctx, ctx.ifd0, TAG_RESOLUTION_UNIT)
  const unitValue =
    unitEntry === null
      ? RESOLUTION_UNIT_CM - 1
      : ctx.view.getUint16(unitEntry.fieldOffset, ctx.isLittleEndian)
  return {
    x: Math.round(x),
    y: Math.round(y),
    unit: unitValue === RESOLUTION_UNIT_CM ? 'cm' : 'inch',
  }
}
