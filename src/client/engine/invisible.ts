/**
 * Invisible (steganographic) watermark for lossless PNG export. The payload is
 * written one bit per pixel into the blue-channel least-significant bit, along
 * a seeded walk over the pixel grid, so a flat re-encode to PNG preserves it
 * while a lossy JPEG re-encode destroys it (the honesty proof).
 *
 * Pure functions over typed arrays: they run identically on the main thread,
 * in a Web Worker, and in jsdom unit tests, and earn coverage there.
 *
 * Payload byte layout (bit order is most-significant-bit first within a byte):
 *   [0, 4)          `WMP1` magic
 *   [4, 6)          UInt16 big-endian message byte length (L)
 *   [6, 6 + L)      UTF-8 message bytes
 *   [6 + L, 10 + L) CRC-32 (big-endian) of the preceding `6 + L` bytes
 *
 * Bootstrap scheme (how the reader locates the length before it knows it):
 *   - The stride is the first prime in `INVISIBLE_STRIDE_PRIMES` coprime to the
 *     pixel count; it is a function of width x height alone, so the reader can
 *     recompute it.
 *   - The 48-bit HEADER (magic + length) is written along a walk whose start is
 *     seeded from `INVISIBLE_MARK_SEED ^ HEADER_WALK_SALT`, where the salt is a
 *     length no real message can have (`MAX_INVISIBLE_MESSAGE_LENGTH + 1`). That
 *     walk depends only on width x height, so the reader replays it, reads 48
 *     bits, verifies the magic, and recovers `L`.
 *   - The BODY (message + CRC) is written along the message-length-seeded walk
 *     (`INVISIBLE_MARK_SEED ^ L`), skipping the 48 header cells so header and
 *     body never overwrite each other. Knowing `L`, the reader replays the same
 *     body walk (same skip) and verifies the CRC.
 */
import { read } from './analysis'
import { crc32 } from './metadata/crc32'
import { mulberry32 } from './random'
import {
  INVISIBLE_MAGIC,
  INVISIBLE_MARK_SEED,
  INVISIBLE_STRIDE_PRIMES,
  MAX_INVISIBLE_MESSAGE_LENGTH,
} from '../../shared/constants'

/** Bytes of the `WMP1` magic prefix. */
const MAGIC_BYTES = 4
/** Bytes of the UInt16 message-length field. */
const LENGTH_BYTES = 2
/** Bytes of the trailing CRC-32. */
const CRC_BYTES = 4
/** Fixed overhead around a message: magic + length + CRC. */
const OVERHEAD_BYTES = MAGIC_BYTES + LENGTH_BYTES + CRC_BYTES
/** Bytes of the self-describing header the reader bootstraps from. */
const HEADER_BYTES = MAGIC_BYTES + LENGTH_BYTES

const BITS_PER_BYTE = 8
/** Bit index of the most-significant bit within a byte. */
const HIGH_BIT_SHIFT = BITS_PER_BYTE - 1
/** Header size in payload bits. */
const HEADER_BITS = HEADER_BYTES * BITS_PER_BYTE

/** RGBA channels per pixel, and the blue channel's offset within one. */
const RGBA_STRIDE = 4
const BLUE_OFFSET = 2
/** Masks a single least-significant bit. */
const LSB_MASK = 1
/** Masks one byte out of a wider integer. */
const BYTE_MASK = 0xff

/** Stride for the degenerate case where every candidate prime divides the grid. */
const FALLBACK_STRIDE = 1
/** A header seed no real message length can collide with. */
const HEADER_WALK_SALT = MAX_INVISIBLE_MESSAGE_LENGTH + 1

const utf8 = new TextEncoder()
const utf8Decoder = new TextDecoder()
const MAGIC = utf8.encode(INVISIBLE_MAGIC)

/** Greatest common divisor via the Euclidean algorithm. */
function gcd(a: number, b: number): number {
  let x = a
  let y = b
  while (y !== 0) {
    const remainder = x % y
    x = y
    y = remainder
  }
  return x
}

/** First stride prime coprime to `pixelCount`, so the walk is a full permutation. */
function strideFor(pixelCount: number): number {
  const coprime = INVISIBLE_STRIDE_PRIMES.find((prime) => gcd(prime, pixelCount) === 1)
  return coprime ?? FALLBACK_STRIDE
}

/** Deterministic first pixel of a walk, seeded from the grid and a length. */
function walkStart(pixelCount: number, seedLength: number): number {
  const next = mulberry32(INVISIBLE_MARK_SEED ^ seedLength)
  return Math.floor(next() * pixelCount)
}

/** Reads one payload bit (MSB first) from a byte buffer. */
function payloadBit(bytes: Uint8Array, bitIndex: number): number {
  const byteIndex = Math.floor(bitIndex / BITS_PER_BYTE)
  const shift = HIGH_BIT_SHIFT - (bitIndex % BITS_PER_BYTE)
  return (read(bytes, byteIndex) >>> shift) & LSB_MASK
}

/** Sets one payload bit (MSB first) in a zero-initialised byte buffer. */
function setPayloadBit(bytes: Uint8Array, bitIndex: number, bit: number): void {
  if (bit !== 1) {
    return
  }
  const byteIndex = Math.floor(bitIndex / BITS_PER_BYTE)
  const shift = HIGH_BIT_SHIFT - (bitIndex % BITS_PER_BYTE)
  bytes[byteIndex] = read(bytes, byteIndex) | (LSB_MASK << shift)
}

/** Writes a bit to the blue-channel LSB of one pixel. */
function writeBlueLsb(data: Uint8ClampedArray, pixelIndex: number, bit: number): void {
  const index = pixelIndex * RGBA_STRIDE + BLUE_OFFSET
  data[index] = (read(data, index) & ~LSB_MASK) | bit
}

/** Reads the blue-channel LSB of one pixel. */
function readBlueLsb(data: Uint8ClampedArray, pixelIndex: number): number {
  return read(data, pixelIndex * RGBA_STRIDE + BLUE_OFFSET) & LSB_MASK
}

/** The `HEADER_BITS` pixels carrying magic + length, in write order. */
function headerCells(pixelCount: number, stride: number): number[] {
  const start = walkStart(pixelCount, HEADER_WALK_SALT)
  const cells: number[] = []
  for (let step = 0; step < HEADER_BITS; step += 1) {
    cells.push((start + step * stride) % pixelCount)
  }
  return cells
}

/** The `count` body pixels carrying message + CRC, skipping the reserved header cells. */
function bodyCells(
  pixelCount: number,
  stride: number,
  seedLength: number,
  reserved: ReadonlySet<number>,
  count: number,
): number[] {
  const start = walkStart(pixelCount, seedLength)
  const cells: number[] = []
  for (let step = 0; step < pixelCount && cells.length < count; step += 1) {
    const cell = (start + step * stride) % pixelCount
    if (!reserved.has(cell)) {
      cells.push(cell)
    }
  }
  return cells
}

/**
 * Maximum message BYTES that fit in a `width` x `height` PNG: one payload bit
 * per pixel, less the fixed overhead, capped at `MAX_INVISIBLE_MESSAGE_LENGTH`.
 */
export function invisibleCapacity(width: number, height: number): number {
  const pixelCount = width * height
  const availableBytes = Math.floor(pixelCount / BITS_PER_BYTE) - OVERHEAD_BYTES
  return Math.max(0, Math.min(availableBytes, MAX_INVISIBLE_MESSAGE_LENGTH))
}

/**
 * Embeds `message` into `data` in place. Throws `RangeError` if the UTF-8
 * message exceeds what the grid can hold.
 */
export function embedInvisibleMark(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  message: string,
): void {
  const messageBytes = utf8.encode(message)
  const byteLength = messageBytes.length
  const pixelCount = width * height
  const requiredBits = (OVERHEAD_BYTES + byteLength) * BITS_PER_BYTE
  if (byteLength > invisibleCapacity(width, height) || requiredBits > pixelCount) {
    throw new RangeError(
      `Invisible mark needs ${String(requiredBits)} pixels; ${String(pixelCount)} available`,
    )
  }

  const payload = new Uint8Array(OVERHEAD_BYTES + byteLength)
  for (let index = 0; index < MAGIC_BYTES; index += 1) {
    payload[index] = read(MAGIC, index)
  }
  payload[MAGIC_BYTES] = (byteLength >>> BITS_PER_BYTE) & BYTE_MASK
  payload[MAGIC_BYTES + 1] = byteLength & BYTE_MASK
  payload.set(messageBytes, HEADER_BYTES)
  const crc = crc32(payload.subarray(0, HEADER_BYTES + byteLength))
  for (let index = 0; index < CRC_BYTES; index += 1) {
    const shift = BITS_PER_BYTE * (CRC_BYTES - 1 - index)
    payload[HEADER_BYTES + byteLength + index] = (crc >>> shift) & BYTE_MASK
  }

  const stride = strideFor(pixelCount)
  const header = headerCells(pixelCount, stride)
  const reserved = new Set(header)
  const body = bodyCells(pixelCount, stride, byteLength, reserved, requiredBits - HEADER_BITS)
  for (const [bitIndex, cell] of header.entries()) {
    writeBlueLsb(data, cell, payloadBit(payload, bitIndex))
  }
  for (const [offset, cell] of body.entries()) {
    writeBlueLsb(data, cell, payloadBit(payload, HEADER_BITS + offset))
  }
}

/**
 * Recovers a message previously embedded by {@link embedInvisibleMark}, or
 * `null` if no valid mark is present (wrong magic, impossible length, or a
 * CRC mismatch — the guard a lossy re-encode trips).
 */
export function readInvisibleMark(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): string | null {
  const pixelCount = width * height
  if (pixelCount < HEADER_BITS) {
    return null
  }
  const stride = strideFor(pixelCount)
  const header = headerCells(pixelCount, stride)
  const headerBytes = new Uint8Array(HEADER_BYTES)
  for (const [bitIndex, cell] of header.entries()) {
    setPayloadBit(headerBytes, bitIndex, readBlueLsb(data, cell))
  }
  for (let index = 0; index < MAGIC_BYTES; index += 1) {
    if (read(headerBytes, index) !== read(MAGIC, index)) {
      return null
    }
  }
  const byteLength =
    (read(headerBytes, MAGIC_BYTES) << BITS_PER_BYTE) | read(headerBytes, MAGIC_BYTES + 1)
  const requiredBits = (OVERHEAD_BYTES + byteLength) * BITS_PER_BYTE
  if (byteLength > invisibleCapacity(width, height) || requiredBits > pixelCount) {
    return null
  }

  const reserved = new Set(header)
  const bodyBitCount = requiredBits - HEADER_BITS
  const body = bodyCells(pixelCount, stride, byteLength, reserved, bodyBitCount)
  if (body.length < bodyBitCount) {
    return null
  }
  const bodyBytes = new Uint8Array(byteLength + CRC_BYTES)
  for (const [offset, cell] of body.entries()) {
    setPayloadBit(bodyBytes, offset, readBlueLsb(data, cell))
  }

  const checked = new Uint8Array(HEADER_BYTES + byteLength)
  checked.set(headerBytes, 0)
  checked.set(bodyBytes.subarray(0, byteLength), HEADER_BYTES)
  let actualCrc = 0
  for (let index = 0; index < CRC_BYTES; index += 1) {
    actualCrc = (actualCrc << BITS_PER_BYTE) | read(bodyBytes, byteLength + index)
  }
  if (actualCrc >>> 0 !== crc32(checked)) {
    return null
  }
  return utf8Decoder.decode(bodyBytes.subarray(0, byteLength))
}
