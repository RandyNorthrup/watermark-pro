/**
 * CRC-32 (IEEE 802.3, the polynomial PNG uses) over a byte range. Table-based
 * so writing a PNG chunk stays cheap. Verified against the canonical check
 * value: `crc32("123456789") === 0xcbf43926`.
 */

const CRC_TABLE_SIZE = 256
const CRC_POLYNOMIAL = 0xed_b8_83_20
const CRC_INITIAL = 0xff_ff_ff_ff
const BYTE = 0xff
const BITS_PER_BYTE = 8

const TABLE = buildTable()

function buildTable(): Uint32Array {
  const table = new Uint32Array(CRC_TABLE_SIZE)
  for (let index = 0; index < CRC_TABLE_SIZE; index += 1) {
    let value = index
    for (let bit = 0; bit < BITS_PER_BYTE; bit += 1) {
      value = (value & 1) === 1 ? CRC_POLYNOMIAL ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
}

/** CRC-32 of `bytes`, as an unsigned 32-bit integer. */
export function crc32(bytes: Uint8Array): number {
  let crc = CRC_INITIAL
  for (const byte of bytes) {
    const slot = TABLE[(crc ^ byte) & BYTE] ?? 0
    crc = slot ^ (crc >>> BITS_PER_BYTE)
  }
  return (crc ^ CRC_INITIAL) >>> 0
}
