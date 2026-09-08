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
  it('sends a bounded report through sendBeacon', () => {
    const beacon = stubBeacon(true)
    reportError('boom', 'at foo (a.js:1:2)')
    expect(beacon).toHaveBeenCalledTimes(1)
    expect(beacon).toHaveBeenCalledWith('/api/client-errors', expect.any(Blob))
  })

  it('truncates a long message to the field limit', async () => {
    const beacon = stubBeacon(true)
    reportError('x'.repeat(5000), null)
    const [, blob] = beacon.mock.calls[0] as [string, Blob]
    const parsed = JSON.parse(await blob.text()) as { message: string; route: string }
    expect(parsed.message.length).toBe(1000)
    expect(parsed.route).toBe(window.location.pathname)
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
  it('reports an uncaught error with its source location', () => {
    const beacon = stubBeacon(true)
    stopReporting = installErrorReporting()
    window.dispatchEvent(
      new ErrorEvent('error', { message: 'kaboom', filename: 'a.js', lineno: 3, colno: 4 }),
    )
    expect(beacon).toHaveBeenCalledTimes(1)
  })

  it('reports an uncaught error with no source when the filename is empty', () => {
    const beacon = stubBeacon(true)
    stopReporting = installErrorReporting()
    window.dispatchEvent(new ErrorEvent('error', { message: 'kaboom' }))
    expect(beacon).toHaveBeenCalledTimes(1)
  })

  it('reports an unhandled rejection, with or without an Error reason', () => {
    const beacon = stubBeacon(true)
    stopReporting = installErrorReporting()
    window.dispatchEvent(rejectionEvent(new Error('rejected')))
    window.dispatchEvent(rejectionEvent('a string reason'))
    expect(beacon).toHaveBeenCalledTimes(2)
  })
})
