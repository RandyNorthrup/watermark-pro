/**
 * Locale-aware date formatting shared by every list view. Each formatter is
 * created on first use: building one loads locale and time-zone data, which
 * cost a phone tens of milliseconds while a page's code evaluated, even on
 * pages that never show a date (PLAN.md §5.5).
 */
const FORMATS = {
  dateTime: { dateStyle: 'medium', timeStyle: 'short' },
  mediumDate: { dateStyle: 'medium' },
  longDate: { dateStyle: 'long' },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>

type DateFormat = keyof typeof FORMATS

const formatters = new Map<DateFormat, Intl.DateTimeFormat>()

function formatWith(format: DateFormat, date: Date | number): string {
  const existing = formatters.get(format)
  if (existing !== undefined) return existing.format(date)
  const formatter = new Intl.DateTimeFormat(undefined, FORMATS[format])
  formatters.set(format, formatter)
  return formatter.format(date)
}

/** Date and time, as list rows show them. */
export function formatDateTime(date: Date | number): string {
  return formatWith('dateTime', date)
}

/** A medium-length date without the time. */
export function formatMediumDate(date: Date | number): string {
  return formatWith('mediumDate', date)
}

/** A long-form date without the time. */
export function formatLongDate(date: Date | number): string {
  return formatWith('longDate', date)
}
