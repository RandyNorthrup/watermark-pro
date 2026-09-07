/**
 * Output file-name patterns for a batch. Pure and deterministic: the same
 * inputs always give the same name. Tokens are filled per photo, unsafe
 * characters are replaced, and an empty result is rejected so a job never
 * writes a nameless file. Duplicate names inside a batch are de-duplicated
 * separately by `uniqueNames` (zip.ts) after resolution.
 */

/** The default when the user has not set a pattern. */
export const DEFAULT_NAME_PATTERN = '{name}-watermarked'

/** Everything one photo needs to resolve a name pattern. */
export interface NameContext {
  /** Source file name without its extension. */
  name: string
  /** 1-based position in the batch. */
  index: number
  /** Number of photos in the batch. */
  count: number
  /** Capture date, else the file's last-modified time. */
  date: Date
  /** Name of the first ticked preset. */
  preset: string
  /** Output pixel size. */
  width: number
  height: number
}

const NAME_TOKENS = [
  '{name}',
  '{index}',
  '{count}',
  '{date}',
  '{preset}',
  '{width}',
  '{height}',
] as const

type NameToken = (typeof NAME_TOKENS)[number]

/** Characters allowed in an output name; everything else becomes a hyphen. */
const UNSAFE_CHARACTERS = /[^\w ().-]/g
/** Runs of separators collapse to one hyphen in a slug. */
const SLUG_SEPARATORS = /[^a-z0-9]+/g
const SLUG_EDGES = /^-+|-+$/g
const DECIMAL_RADIX = 10
const YEAR_DIGITS = 4

/** Lower-case, hyphen-separated, no leading or trailing hyphen. */
function slugify(value: string): string {
  return value.toLowerCase().replaceAll(SLUG_SEPARATORS, '-').replaceAll(SLUG_EDGES, '')
}

/** `YYYY-MM-DD` in local time. */
function isoDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(YEAR_DIGITS, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Resolves a name pattern for one photo. `{index}` is zero-padded to the batch's
 * digit count. Throws `RangeError` when the pattern resolves to an empty name,
 * which the pattern field prevents before a batch can start.
 */
export function resolveNamePattern(pattern: string, context: NameContext): string {
  const digits = String(context.count).length
  const values: Record<NameToken, string> = {
    '{name}': context.name,
    '{index}': String(context.index).padStart(digits, '0'),
    '{count}': context.count.toString(DECIMAL_RADIX),
    '{date}': isoDate(context.date),
    '{preset}': slugify(context.preset),
    '{width}': context.width.toString(DECIMAL_RADIX),
    '{height}': context.height.toString(DECIMAL_RADIX),
  }
  let resolved = pattern
  for (const token of NAME_TOKENS) {
    resolved = resolved.split(token).join(values[token])
  }
  const safe = resolved.replaceAll(UNSAFE_CHARACTERS, '-').trim()
  if (safe === '') {
    throw new RangeError('the file-name pattern resolves to an empty name')
  }
  return safe
}
