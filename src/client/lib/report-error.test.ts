import { afterEach, describe, expect, it, vi } from 'vitest'

import { installErrorReporting, reportError, topStackFrame } from './report-error'

let stopReporting: (() => void) | null = null

afterEach(() => {
  stopReporting?.()
  stopReporting = null
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** Replaces navigator.sendBeacon and returns the spy. */
function stubBeacon(isSuccessful: boolean): ReturnType<typeof vi.fn> {
  const beacon = vi.fn(() => isSuccessful)
  vi.stubGlobal('navigator', { sendBeacon: beacon })
  return beacon
}

/** An unhandledrejection-shaped event carrying `reason`, without using `any`. */
function rejectionEvent(reason: unknown): Event {
  return Object.assign(new Event('unhandledrejection'), { reason })
}

describe('topStackFrame', () => {
  it('returns the first V8-style frame', () => {
    expect(topStackFrame('Error: boom\n    at foo (a.js:1:2)\n    at bar (b.js:3:4)')).toBe(
      'at foo (a.js:1:2)',
    )
  })

  it('returns the first Firefox-style frame', () => {
    expect(topStackFrame('boom\nfoo@https://x/a.js:1:2')).toBe('foo@https://x/a.js:1:2')
  })

  it('returns null when there is no stack', () => {
    expect(topStackFrame(undefined)).toBeNull()
  })
})

describe('reportError', () => {
  it('never transmits arbitrary error text or bearer URLs', async () => {
    const beacon = stubBeacon(true)
    reportError(
      'PRIVATE_CONTENT_CANARY person@example.test',
      'at https://outside.test/share/TOKEN_CANARY?code=CODE_CANARY:1:2',
    )
    const [, blob] = beacon.mock.calls[0] as [string, Blob]
    const body = await blob.text()
    expect(JSON.parse(body)).toMatchObject({ message: 'Error' })
    for (const sensitive of [
      'PRIVATE_CONTENT_CANARY',
      'person@example.test',
      'TOKEN_CANARY',
      'CODE_CANARY',
    ])
      expect(body).not.toContain(sensitive)
    expect(JSON.parse(body)).not.toHaveProperty('source')
  })
  it('sends a bounded report through sendBeacon', () => {
    const beacon = stubBeacon(true)
    reportError('boom', 'at foo (a.js:1:2)')
    expect(beacon).toHaveBeenCalledTimes(1)
    expect(beacon).toHaveBeenCalledWith('/api/client-errors', expect.any(Blob))
  })

  it('reduces arbitrary long text to the generic error classification', async () => {
    const beacon = stubBeacon(true)
    reportError('x'.repeat(5000), null)
    const [, blob] = beacon.mock.calls[0] as [string, Blob]
    const parsed = JSON.parse(await blob.text()) as { message: string; route: string }
    expect(parsed.message).toBe('Error')
    expect(parsed.route).toBe(window.location.pathname)
  })

  it('keeps the error class and own compiled asset coordinates without query, fragment or frame name', async () => {
    const beacon = stubBeacon(true)
    reportError(
      'TypeError',
      `at PRIVATE_NAME (${window.location.origin}/assets/index-abc123.js?token=TOKEN_CANARY#secret:3:4)`,
    )
    const [, blob] = beacon.mock.calls[0] as [string, Blob]
    expect(JSON.parse(await blob.text())).toEqual({
      message: 'TypeError',
      source: '/assets/index-abc123.js:3:4',
      route: '/',
    })
  })

  it.each([
    'a.js:1:2',
    'http://[invalid/assets/index.js:1:2',
    `${window.location.origin}/share/private-token:1:2`,
    `${window.location.origin}/assets/index.js`,
    'x'.repeat(501),
  ])('discards untrusted or incomplete source coordinates: %s', async (source) => {
    const beacon = stubBeacon(true)
    reportError('RangeError', source)
    const [, blob] = beacon.mock.calls[0] as [string, Blob]
    expect(JSON.parse(await blob.text())).not.toHaveProperty('source')
  })

  it('falls back to fetch when sendBeacon declines', () => {
    stubBeacon(false)
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null)))
    vi.stubGlobal('fetch', fetchMock)
    reportError('boom', null)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/client-errors',
      expect.objectContaining({ method: 'POST', keepalive: true }),
    )
  })

  it('falls back to fetch when sendBeacon throws', () => {
    vi.stubGlobal('navigator', {
      sendBeacon: () => {
        throw new Error('beacon unavailable')
      },
    })
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null)))
    vi.stubGlobal('fetch', fetchMock)
    reportError('boom', null)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('installErrorReporting', () => {
  it('reports an uncaught error class and sanitized source location', async () => {
    const beacon = stubBeacon(true)
    stopReporting = installErrorReporting()
    window.dispatchEvent(
      new ErrorEvent('error', {
        error: new TypeError('PRIVATE_MESSAGE'),
        message: 'PRIVATE_MESSAGE',
        filename: `${window.location.origin}/assets/app-abc123.js?code=PRIVATE_CODE`,
        lineno: 3,
        colno: 4,
      }),
    )
    expect(beacon).toHaveBeenCalledTimes(1)
    const [, blob] = beacon.mock.calls[0] as [string, Blob]
    expect(JSON.parse(await blob.text())).toEqual({
      message: 'TypeError',
      source: '/assets/app-abc123.js:3:4',
      route: '/',
    })
  })

  it('reports an uncaught error with no source when the filename is empty', () => {
    const beacon = stubBeacon(true)
    stopReporting = installErrorReporting()
    window.dispatchEvent(new ErrorEvent('error', { message: 'kaboom' }))
    expect(beacon).toHaveBeenCalledTimes(1)
  })

  it('reports rejection classifications without converting arbitrary rejected objects', async () => {
    const beacon = stubBeacon(true)
    stopReporting = installErrorReporting()
    window.dispatchEvent(rejectionEvent(new Error('rejected')))
    window.dispatchEvent(
      rejectionEvent({
        toString: () => {
          throw new Error('Must not stringify private objects')
        },
      }),
    )
    expect(beacon).toHaveBeenCalledTimes(2)
    const reports = await Promise.all(
      beacon.mock.calls.map(async (call) => {
        const [, blob] = call as [string, Blob]
        return JSON.parse(await blob.text()) as { message: string }
      }),
    )
    expect(reports.map((report) => report.message)).toEqual(['Error', 'UnhandledRejection'])
  })
})
