import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.resetModules()
})

const SAMPLE = Date.UTC(2026, 10, 7, 15, 30)

describe('date formatting', () => {
  it('builds no formatter until a date is shown, then reuses each one', async () => {
    const original = Intl.DateTimeFormat
    const count = { constructed: 0 }
    Intl.DateTimeFormat = new Proxy(original, {
      construct(target, args: Parameters<typeof original>) {
        count.constructed += 1
        return new target(...args)
      },
    })
    try {
      const { formatDateTime, formatLongDate, formatMediumDate } = await import('./format-date')
      expect(count.constructed).toBe(0)

      formatDateTime(SAMPLE)
      formatDateTime(SAMPLE)
      formatMediumDate(SAMPLE)
      formatLongDate(SAMPLE)
      formatLongDate(SAMPLE)
      expect(count.constructed).toBe(3)
    } finally {
      Intl.DateTimeFormat = original
    }
  })

  it('matches the platform formatting for each style', async () => {
    const { formatDateTime, formatLongDate, formatMediumDate } = await import('./format-date')
    const expected = (options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(undefined, options).format(SAMPLE)
    expect(formatDateTime(SAMPLE)).toBe(expected({ dateStyle: 'medium', timeStyle: 'short' }))
    expect(formatMediumDate(SAMPLE)).toBe(expected({ dateStyle: 'medium' }))
    expect(formatLongDate(SAMPLE)).toBe(expected({ dateStyle: 'long' }))
  })
})
