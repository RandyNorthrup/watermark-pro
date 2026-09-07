/**
 * Deterministic pseudo-random numbers for placement that reproduces across a
 * batch and a preview. Seeded per photo from its name, size and modified
 * time, so the same file always lands in the same place; a per-layer salt
 * lets the editor shuffle without changing the file.
 */

const FNV_OFFSET_BASIS = 0x81_1c_9d_c5
const FNV_PRIME = 0x01_00_01_93
const UINT32 = 0x1_00_00_00_00

// mulberry32's fixed mixing constants (a well-known 32-bit generator).
const MULBERRY_INCREMENT = 0x6d_2b_79_f5
const MULBERRY_SHIFT_A = 15
const MULBERRY_SHIFT_B = 7
const MULBERRY_SHIFT_C = 14
const MULBERRY_OR_B = 61

/** A 32-bit unsigned mulberry32 generator; returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + MULBERRY_INCREMENT) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> MULBERRY_SHIFT_A), t | 1)
    t ^= t + Math.imul(t ^ (t >>> MULBERRY_SHIFT_B), t | MULBERRY_OR_B)
    return ((t ^ (t >>> MULBERRY_SHIFT_C)) >>> 0) / UINT32
  }
}

const utf8 = new TextEncoder()

/** FNV-1a 32-bit hash of a string, as an unsigned 32-bit integer. */
export function hashString(value: string): number {
  let hash = FNV_OFFSET_BASIS
  // Canonical byte-wise FNV-1a; iterating the UTF-8 bytes yields definite
  // numbers, so there is no undefined-index case to guard.
  for (const byte of utf8.encode(value)) {
    hash ^= byte
    hash = Math.imul(hash, FNV_PRIME)
  }
  return hash >>> 0
}

/** A stable seed for a photo: its name, byte size and last-modified time. */
export function seedFor(file: File): number {
  return hashString(`${file.name}:${String(file.size)}:${String(file.lastModified)}`)
}
