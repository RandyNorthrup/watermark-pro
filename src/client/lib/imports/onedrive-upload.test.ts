import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ensureOneDriveFolder, oneDriveUploadUrl, uploadOneDriveImage } from './onedrive-upload'
import { MICROSOFT_GRAPH_ROOT } from '../../../shared/constants'
import { setOfflineUser } from '../offline-context'

const SESSION = 'https://sn3302.up.1drv.com/up/session'
const SAVED = {
  id: 'new-file',
  name: 'photo (1).png',
  webUrl: 'https://onedrive.live.com/?id=new-file',
}
const UPLOAD = { name: 'photo.png', blob: new Blob(['photo bytes'], { type: 'image/png' }) }
beforeEach(() => setOfflineUser('owner'))
afterEach(() => vi.unstubAllGlobals())

describe('OneDrive safe writes', () => {
  it('creates a missing folder explicitly and surfaces forbidden folder access', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ id: 'created-folder', folder: {} }, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
    vi.stubGlobal('fetch', fetcher)
    expect(await ensureOneDriveFolder('token')).toBe('created-folder')
    expect(fetcher.mock.calls[1]?.[0]).toBe(`${MICROSOFT_GRAPH_ROOT}/me/drive/root/children`)
    await expect(ensureOneDriveFolder('token')).rejects.toThrow('403')
  })

  it('refuses malformed progress and a premature completion acknowledgement', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ uploadUrl: SESSION }))
      .mockResolvedValueOnce(Response.json({ nextExpectedRanges: ['0-'] }, { status: 202 }))
      .mockResolvedValueOnce(Response.json({ uploadUrl: SESSION }))
      .mockResolvedValueOnce(Response.json(SAVED, { status: 201 }))
    vi.stubGlobal('fetch', fetcher)
    await expect(uploadOneDriveImage('token', UPLOAD, 'folder')).rejects.toThrow(
      'expected upload range',
    )
    const largeBlob = new Blob([new Uint8Array(5_242_881)])
    await expect(
      uploadOneDriveImage('token', { ...UPLOAD, blob: largeBlob }, 'folder'),
    ).rejects.toThrow('incomplete upload')
    expect(fetcher).toHaveBeenCalledTimes(4)
  })
  it('creates a missing real folder before use and handles a concurrent create', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ id: 'folder', folder: {} }))
    vi.stubGlobal('fetch', fetcher)
    expect(await ensureOneDriveFolder('token')).toBe('folder')
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({
        name: 'Lumafoil',
        folder: {},
        '@microsoft.graph.conflictBehavior': 'fail',
      }),
    })
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('reuses an existing folder and refuses a file with the folder name', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id: 'folder', folder: {} }))
      .mockResolvedValueOnce(Response.json({ id: 'file', file: {} }))
    vi.stubGlobal('fetch', fetcher)
    expect(await ensureOneDriveFolder('token')).toBe('folder')
    await expect(ensureOneDriveFolder('token')).rejects.toThrow()
    expect(fetcher.mock.calls.every((call) => call[1]?.method !== 'POST')).toBe(true)
  })

  it('uploads with explicit rename policy and never sends a bearer token to the upload URL', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ uploadUrl: SESSION }))
      .mockResolvedValueOnce(Response.json(SAVED, { status: 201 }))
    vi.stubGlobal('fetch', fetcher)
    const result = await uploadOneDriveImage('secret-token', UPLOAD, 'folder')
    expect(result).toMatchObject({ id: 'new-file', name: 'photo (1).png', userId: 'owner' })
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      `${MICROSOFT_GRAPH_ROOT}/me/drive/items/folder:/photo.png:/createUploadSession`,
    )
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({
        item: { name: 'photo.png', '@microsoft.graph.conflictBehavior': 'rename' },
      }),
    })
    const upload = fetcher.mock.calls[1]
    expect(upload?.[0]).toBe(SESSION)
    expect(upload?.[1]).toMatchObject({
      method: 'PUT',
      credentials: 'omit',
      headers: { 'Content-Range': 'bytes 0-10/11' },
    })
    expect(new Headers(upload?.[1]?.headers).has('Authorization')).toBe(false)
    expect(() => oneDriveUploadUrl('../private.jpg', 'folder')).toThrow()
  })

  it('writes aligned fragments in order and requires the completed file response', async () => {
    const chunk = 5 * 1024 * 1024
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ uploadUrl: SESSION }))
      .mockResolvedValueOnce(
        Response.json({ nextExpectedRanges: [`${String(chunk)}-`] }, { status: 202 }),
      )
      .mockResolvedValueOnce(Response.json(SAVED, { status: 201 }))
    vi.stubGlobal('fetch', fetcher)
    await uploadOneDriveImage(
      'token',
      { ...UPLOAD, blob: new Blob([new Uint8Array(chunk + 1)]) },
      'folder',
    )
    expect(new Headers(fetcher.mock.calls[1]?.[1]?.headers).get('Content-Range')).toBe(
      `bytes 0-${String(chunk - 1)}/${String(chunk + 1)}`,
    )
    expect(new Headers(fetcher.mock.calls[2]?.[1]?.headers).get('Content-Range')).toBe(
      `bytes ${String(chunk)}-${String(chunk)}/${String(chunk + 1)}`,
    )
  })

  it('refuses an external upload host and an account switch before sending any bytes', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ uploadUrl: 'https://attacker.example/upload' }))
      .mockImplementationOnce(() => {
        setOfflineUser('other')
        return Promise.resolve(Response.json({ uploadUrl: SESSION }))
      })
    vi.stubGlobal('fetch', fetcher)
    await expect(uploadOneDriveImage('token', UPLOAD, 'folder')).rejects.toThrow('unexpected URL')
    await expect(uploadOneDriveImage('token', UPLOAD, 'folder')).rejects.toThrow('account changed')
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls.every((call) => call[1]?.method === 'POST')).toBe(true)
  })

  it('does not claim success for an empty, failed, or unacknowledged upload', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ uploadUrl: SESSION }))
      .mockResolvedValueOnce(new Response(null, { status: 507 }))
      .mockResolvedValueOnce(Response.json({ uploadUrl: SESSION }))
      .mockResolvedValueOnce(Response.json({ nextExpectedRanges: ['11-'] }, { status: 202 }))
    vi.stubGlobal('fetch', fetcher)
    await expect(
      uploadOneDriveImage('token', { ...UPLOAD, blob: new Blob() }, 'folder'),
    ).rejects.toThrow('empty')
    await expect(uploadOneDriveImage('token', UPLOAD, 'folder')).rejects.toThrow('507')
    await expect(uploadOneDriveImage('token', UPLOAD, 'folder')).rejects.toThrow('did not confirm')
  })
})
