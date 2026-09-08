import { afterEach, describe, expect, it, vi } from 'vitest'

import { downloadDriveFiles, driveMediaUrl, mapPickedDocuments } from './google-picker'
import { GOOGLE_DRIVE_FILES_ENDPOINT, HTTP_STATUS } from '../../../shared/constants'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('driveMediaUrl', () => {
  it('builds the media endpoint URL for a file id', () => {
    expect(driveMediaUrl('abc123')).toBe(`${GOOGLE_DRIVE_FILES_ENDPOINT}/abc123?alt=media`)
  })

  it('percent-encodes an id with reserved characters', () => {
    expect(driveMediaUrl('a b/c?d')).toBe(`${GOOGLE_DRIVE_FILES_ENDPOINT}/a%20b%2Fc%3Fd?alt=media`)
  })
})

describe('mapPickedDocuments', () => {
  it('maps each document to id, name, and type in order', () => {
    expect(
      mapPickedDocuments({
        action: 'picked',
        docs: [
          { id: '1', name: 'first.png', mimeType: 'image/png' },
          { id: '2', name: 'second.jpg', mimeType: 'image/jpeg' },
        ],
      }),
    ).toEqual([
      { id: '1', name: 'first.png', type: 'image/png' },
      { id: '2', name: 'second.jpg', type: 'image/jpeg' },
    ])
  })

  it('returns an empty list when the payload carries no documents (cancel)', () => {
    expect(mapPickedDocuments({ action: 'cancel' })).toEqual([])
  })
})

describe('downloadDriveFiles', () => {
  it('downloads each file with the bearer token and preserves order', async () => {
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const url = typeof input === 'string' ? input : ''
      const byte = url.includes('/one?') ? 1 : 2
      return Promise.resolve(
        new Response(new Uint8Array([byte]), {
          status: HTTP_STATUS.ok,
          headers: { 'content-type': 'image/png' },
        }),
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const files = await downloadDriveFiles(
      [
        { id: 'one', name: 'one.png', type: 'image/png' },
        { id: 'two', name: 'two.png', type: 'image/png' },
      ],
      'token-xyz',
    )

    expect(files.map((file) => file.name)).toEqual(['one.png', 'two.png'])
    expect(files[0]).toBeInstanceOf(File)
    expect(await files[0]?.arrayBuffer()).toEqual(new Uint8Array([1]).buffer)
    expect(files[0]?.type).toBe('image/png')

    const call = fetchMock.mock.calls[0]
    expect(call?.[0]).toBe(driveMediaUrl('one'))
    expect(call?.[1]).toMatchObject({ headers: { Authorization: 'Bearer token-xyz' } })
  })

  it('falls back to the blob type when the picked type is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() =>
        Promise.resolve(
          new Response(new Uint8Array([7]), {
            status: HTTP_STATUS.ok,
            headers: { 'content-type': 'image/webp' },
          }),
        ),
      ),
    )

    const [file] = await downloadDriveFiles([{ id: 'x', name: 'x.webp', type: '' }], 'token')
    expect(file?.type).toBe('image/webp')
  })

  it('rejects with a readable Error when a download fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() =>
        Promise.resolve(new Response(null, { status: HTTP_STATUS.internalServerError })),
      ),
    )

    await expect(
      downloadDriveFiles([{ id: 'x', name: 'broken.png', type: 'image/png' }], 'token'),
    ).rejects.toThrow('Could not download broken.png from Google Drive (HTTP 500).')
  })
})
