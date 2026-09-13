import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { uploadResumableGoogleFile } from './google-drive-upload'
import { setOfflineUser } from '../offline-context'

const LOCATION =
  'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=opaque'
const CHUNK = 8_388_608
beforeEach(() => setOfflineUser('owner'))
afterEach(() => vi.unstubAllGlobals())

describe('original-byte Google resumable uploads', () => {
  it.each([
    {
      stage: 'start',
      response: () => new Response(null, { status: 403 }),
      message: 'could not start',
    },
    {
      stage: 'start',
      response: () => new Response(null),
      message: 'did not return an upload location',
    },
    {
      stage: 'start',
      response: () =>
        new Response(null, { headers: { location: 'https://www.googleapis.com/other' } }),
      message: 'unexpected upload location',
    },
    {
      stage: 'upload',
      response: () => new Response(null, { status: 403 }),
      message: 'could not save',
    },
    {
      stage: 'upload',
      response: () => new Response(null, { status: 308, headers: { range: 'bytes=0-2' } }),
      message: 'did not confirm the complete file',
    },
  ])(
    'does not claim a saved file when $stage reports $message',
    async ({ stage, response, message }) => {
      const fetcher = vi.fn<typeof fetch>()
      if (stage === 'upload')
        fetcher.mockResolvedValueOnce(new Response(null, { headers: { location: LOCATION } }))
      fetcher.mockResolvedValueOnce(response())
      vi.stubGlobal('fetch', fetcher)
      await expect(
        uploadResumableGoogleFile('token', 'folder', {
          name: 'image.png',
          blob: new Blob(['abc']),
        }),
      ).rejects.toThrow(message)
      expect(fetcher).toHaveBeenCalledTimes(stage === 'upload' ? 2 : 1)
    },
  )

  it('rejects an empty upload before opening a provider session', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    await expect(
      uploadResumableGoogleFile('token', 'folder', { name: 'empty.png', blob: new Blob() }),
    ).rejects.toThrow('empty file')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('sends contiguous chunks and requires final identity after the acknowledged range', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { headers: { location: LOCATION } }))
      .mockResolvedValueOnce(
        new Response(null, { status: 308, headers: { range: 'bytes=0-8388607' } }),
      )
      .mockResolvedValueOnce(Response.json({ id: 'saved', name: 'video.mp4' }))
    vi.stubGlobal('fetch', fetcher)
    const bytes = new Blob([new Uint8Array(CHUNK), new Uint8Array([1, 2, 3])], {
      type: 'video/mp4',
    })
    expect(
      await uploadResumableGoogleFile('token', 'chosen-folder', { name: 'video.mp4', blob: bytes }),
    ).toMatchObject({ id: 'saved', name: 'video.mp4', userId: 'owner' })
    expect(fetcher.mock.calls[0]?.[1]?.body).toBe(
      '{"name":"video.mp4","parents":["chosen-folder"]}',
    )
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({
      headers: { 'Content-Range': 'bytes 0-8388607/8388611' },
      redirect: 'error',
    })
    expect(fetcher.mock.calls[2]?.[1]).toMatchObject({
      headers: { 'Content-Range': 'bytes 8388608-8388610/8388611' },
    })
    const tail = fetcher.mock.calls[2]?.[1]?.body
    if (!(tail instanceof Blob)) throw new Error('Expected original tail bytes')
    expect(new Uint8Array(await tail.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('rejects foreign upload destinations before sending media or credentials', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, { headers: { location: 'https://attacker.test/collect' } }),
      )
    vi.stubGlobal('fetch', fetcher)
    await expect(
      uploadResumableGoogleFile('token', 'folder', {
        name: 'photo.png',
        blob: new Blob(['bytes']),
      }),
    ).rejects.toThrow('unexpected URL')
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('stops on incorrect acknowledgements and never declares an incomplete session saved', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { headers: { location: LOCATION } }))
      .mockResolvedValueOnce(new Response(null, { status: 308, headers: { range: 'bytes=0-5' } }))
    vi.stubGlobal('fetch', fetcher)
    const video = { name: 'video.mp4', blob: new Blob([new Uint8Array(CHUNK + 1)]) }
    await expect(uploadResumableGoogleFile('token', 'folder', video)).rejects.toThrow(
      'expected upload range',
    )
    expect(fetcher).toHaveBeenCalledTimes(2)
    fetcher
      .mockResolvedValueOnce(new Response(null, { headers: { location: LOCATION } }))
      .mockResolvedValueOnce(Response.json({ id: 'early' }))
    await expect(uploadResumableGoogleFile('token', 'folder', video)).rejects.toThrow(
      'incomplete file',
    )
    expect(fetcher).toHaveBeenCalledTimes(4)
  })
})
