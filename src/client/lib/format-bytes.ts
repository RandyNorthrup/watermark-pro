import { BYTES_PER_MEGABYTE } from '../../shared/constants'

const BYTES_PER_KILOBYTE = 1024
const BYTES_PER_GIGABYTE = BYTES_PER_KILOBYTE * BYTES_PER_MEGABYTE

/** Human-readable size: kB below a megabyte, MB below a gigabyte, GB above. */
export function formatBytes(bytes: number): string {
  if (bytes >= BYTES_PER_GIGABYTE) {
    return `${(bytes / BYTES_PER_GIGABYTE).toFixed(2)} GB`
  }
  if (bytes >= BYTES_PER_MEGABYTE) {
    return `${(bytes / BYTES_PER_MEGABYTE).toFixed(1)} MB`
  }
  return `${String(Math.round(bytes / BYTES_PER_KILOBYTE))} kB`
}
