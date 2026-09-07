import { afterEach, describe, expect, it, vi } from 'vitest'

import { deriveFileName, importFromUrl } from './url'
import { API_ERROR_CODE, HTTP_STATUS } from '../../../shared/constants'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('deriveFileName', () => {
  it('prefers a quoted Content-Disposition filename', () => {
    expect(
      deriveFileName({
        contentDisposition: 'inline; filename="beach.jpg"',
        url: 'https://cdn.example.com/x/y.png',
        contentType: 'image/png',
      }),
    ).toBe('beach.jpg')
  })

  it('reads an unquoted Content-Disposition filename', () => {
    expect(
      deriveFileName({
        contentDisposition: 'attachment; filename=sunset.webp',
        url: 'https://cdn.example.com/',
        contentType: 'image/webp',
      }),
    ).toBe('sunset.webp')
  })

  it('decodes an RFC 5987 extended filename', () => {
    expect(
      deriveFileName({
        contentDisposition: "inline; filename*=UTF-8''holiday%20photo.jpeg",
        url: 'https://cdn.example.com/',
        contentType: 'image/jpeg',
      }),
    ).toBe('holiday photo.jpeg')
  })

  it('falls back to the plain form when the extended value is malformed', () => {
    expect(
      deriveFileName({
        contentDisposition: 'inline; filename*=UTF-8\'\'%E0%A4%A; filename="safe.png"',
        url: 'https://cdn.example.com/',
        contentType: 'image/png',
      }),
    ).toBe('safe.png')
  })

  it('ignores a disposition header that carries no filename', () => {
    expect(
      deriveFileName({
        contentDisposition: 'attachment',
        url: 'https://cdn.example.com/',
        contentType: 'image/png',
      }),
    ).toBe('imported.png')
  })

  it('uses the URL last path segment when there is no header', () => {
    expect(
      deriveFileName({
        contentDisposition: null,
        url: 'https://cdn.example.com/albums/spring/tulip%20bed.png?raw=1',
        contentType: 'image/png',
      }),
    ).toBe('tulip bed.png')
  })

  it('builds imported.<ext> from the MIME subtype for a bare path', () => {
    expect(
      deriveFileName({
        contentDisposition: null,
        url: 'https://cdn.example.com/',
        contentType: 'image/webp',
      }),
    ).toBe('imported.webp')
  })

  it('strips MIME parameters when deriving the extension', () => {
    expect(
      deriveFileName({
        contentDisposition: null,
        url: 'https://cdn.example.com/',
        contentType: 'image/jpeg; charset=binary',
      }),
    ).toBe('imported.jpeg')
  })

  it('yields the bare stem when the type has no subtype', () => {
    expect(
      deriveFileName({
        contentDisposition: null,
        url: 'https://cdn.example.com/',
        contentType: '',
      }),
    ).toBe('imported')
  })

  it('falls back when the URL cannot be parsed', () => {
    expect(
      deriveFileName({ contentDisposition: null, url: 'not a url', contentType: 'image/png' }),
    ).toBe('imported.png')
  })

  it('keeps a URL segment that is not valid percent-encoding', () => {
    expect(
      deriveFileName({
        contentDisposition: null,
        url: 'https://cdn.example.com/%E0%A4%A',
        contentType: 'image/png',
      }),
    ).toBe('%E0%A4%A')
  })
})

describe('importFromUrl', () => {
  it('returns a File named from the response headers', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(new Uint8Array([1, 2, 3]), {
          status: HTTP_STATUS.ok,
          headers: {
            'content-type': 'image/jpeg',
            'content-disposition': 'inline; filename="from-header.jpg"',
          },
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const file = await importFromUrl('org-1', 'https://cdn.example.com/a.jpg')

    expect(file).toBeInstanceOf(File)
    expect(file.name).toBe('from-header.jpg')
    expect(file.type).toBe('image/jpeg')
    expect(await file.arrayBuffer()).toEqual(new Uint8Array([1, 2, 3]).buffer)
    const call = fetchMock.mock.calls[0]
    expect(call?.[0]).toBe('/api/orgs/org-1/imports/url')
    expect(call?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ url: 'https://cdn.example.com/a.jpg' }),
    })
  })

  it('names the File from the URL when no header is present', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(new Uint8Array([9]), {
            status: HTTP_STATUS.ok,
            headers: { 'content-type': 'image/png' },
          }),
        ),
      ),
    )

    const file = await importFromUrl('org-1', 'https://cdn.example.com/pics/logo.png')
    expect(file.name).toBe('logo.png')
  })

  it('propagates a typed API error with its mapped message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json(
            { error: API_ERROR_CODE.rateLimited },
            { status: HTTP_STATUS.tooManyRequests },
          ),
        ),
      ),
    )

    await expect(importFromUrl('org-1', 'https://cdn.example.com/a.jpg')).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: HTTP_STATUS.tooManyRequests,
      code: API_ERROR_CODE.rateLimited,
      message: 'Too many requests. Please wait a moment.',
    })
  })
})
