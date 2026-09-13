import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CLOUD_ROOT_FOLDER,
  createCloudFolder,
  downloadCloudFile,
  listCloudFolder,
  type CloudBrowserFile,
} from './cloud-folders'
import { cloudMediaKind, toCloudFile } from './cloud-media'
import { setOfflineUser } from '../offline-context'

beforeEach(() => setOfflineUser('owner'))
afterEach(() => vi.unstubAllGlobals())
const PDF: CloudBrowserFile = {
  id: 'original',
  name: 'original.pdf',
  kind: 'file',
  mimeType: 'application/pdf',
}

describe('cloud destination and download boundaries', () => {
  it.each([
    {
      provider: 'google',
      folder: CLOUD_ROOT_FOLDER,
      endpoint: 'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true',
      body: { name: 'Exports', mimeType: 'application/vnd.google-apps.folder', parents: ['root'] },
    },
    {
      provider: 'onedrive',
      folder: CLOUD_ROOT_FOLDER,
      endpoint: 'https://graph.microsoft.com/v1.0/me/drive/root/children',
      body: { name: 'Exports', folder: {}, '@microsoft.graph.conflictBehavior': 'fail' },
    },
    {
      provider: 'onedrive',
      folder: { id: 'nested/id', name: 'Nested' },
      endpoint: 'https://graph.microsoft.com/v1.0/me/drive/items/nested%2Fid/children',
      body: { name: 'Exports', folder: {}, '@microsoft.graph.conflictBehavior': 'fail' },
    },
  ] as const)(
    'creates the actual $provider destination inside $folder.id',
    async ({ provider, folder, endpoint, body }) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json({ id: 'created', name: 'Exports' }))
      vi.stubGlobal('fetch', fetcher)
      expect(await createCloudFolder(provider, 'token', folder, ' Exports ')).toEqual({
        id: 'created',
        name: 'Exports',
      })
      expect(fetcher).toHaveBeenCalledWith(
        endpoint,
        expect.objectContaining({ method: 'POST', body: JSON.stringify(body), redirect: 'error' }),
      )
    },
  )

  it('follows Google page tokens and ignores unsupported cloud-native files', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          files: [
            { id: 'native', name: 'Sheet', mimeType: 'application/vnd.google-apps.spreadsheet' },
          ],
          nextPageToken: 'page-two',
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          files: [{ id: 'original', name: 'original.pdf', mimeType: 'application/pdf' }],
        }),
      )
    vi.stubGlobal('fetch', fetcher)
    expect(await listCloudFolder('google', 'token', CLOUD_ROOT_FOLDER, ['document'])).toEqual([PDF])
    expect(fetcher.mock.calls[1]?.[0]).toEqual(expect.stringContaining('pageToken=page-two'))
  })

  it('keeps Dropbox folder identifiers usable while filtering unknown or unsupported entries', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({
        entries: [
          { '.tag': 'folder', id: 'id:folder', name: 'Folder' },
          { '.tag': 'file', id: 'id:text', name: 'notes.txt' },
          { '.tag': 'deleted', id: 'id:old', name: 'old.pdf' },
          { '.tag': 'file', id: 'id:pdf', name: 'Original.PDF' },
        ],
        cursor: 'end',
        has_more: false,
      }),
    )
    vi.stubGlobal('fetch', fetcher)
    const items = await listCloudFolder('dropbox', 'token', { id: 'id:parent', name: 'Parent' }, [
      'document',
    ])
    expect(items.map((item) => item.id)).toEqual(['id:folder', 'id:pdf'])
    expect(items[0]).not.toHaveProperty('path')
    expect(fetcher.mock.calls[0]?.[1]?.body).toContain('"path":"id:parent"')
  })

  it.each(['google', 'onedrive'] as const)(
    'preserves $provider original bytes and rejects a redirected non-provider response',
    async (provider) => {
      const address =
        provider === 'google'
          ? 'https://content.googleusercontent.com/original'
          : 'https://personal.files.1drv.com/original'
      const file = { ...PDF, downloadUrl: address }
      const response = new Response('ORIGINAL PDF')
      Object.defineProperty(response, 'url', { value: address })
      const redirected = new Response('UNTRUSTED')
      Object.defineProperty(redirected, 'url', { value: 'https://outside.test/original' })
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(response)
        .mockResolvedValueOnce(redirected)
      vi.stubGlobal('fetch', fetcher)
      const downloaded = await downloadCloudFile(provider, 'token', file, ['document'])
      expect(await downloaded.text()).toBe('ORIGINAL PDF')
      expect(downloaded.type).toBe('application/pdf')
      expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe(
        provider === 'google' ? 'Bearer token' : null,
      )
      await expect(downloadCloudFile(provider, 'token', file, ['document'])).rejects.toThrow(
        'unexpected URL',
      )
    },
  )

  it('does not download a OneDrive item lacking its provider URL or a failed Google response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 404 }))
    vi.stubGlobal('fetch', fetcher)
    await expect(downloadCloudFile('onedrive', 'token', PDF, ['document'])).rejects.toThrow(
      'no download URL',
    )
    expect(fetcher).not.toHaveBeenCalled()
    await expect(downloadCloudFile('google', 'token', PDF, ['document'])).rejects.toThrow(
      'original.pdf',
    )
  })

  it('recognizes declared types and binary containers without interpreting unknown extensions as media', () => {
    expect(cloudMediaKind('application/octet-stream', 'Original.PDF')).toBe('document')
    expect(cloudMediaKind('video/mp4', 'clip')).toBe('video')
    expect(cloudMediaKind('application/octet-stream')).toBeNull()
    const bytes = new Blob(['original'])
    expect(toCloudFile(bytes, 'Original.PDF', 'application/octet-stream', ['document']).type).toBe(
      'application/pdf',
    )
    expect(() => toCloudFile(bytes, 'payload.exe', '', ['image', 'document', 'video'])).toThrow(
      'not supported',
    )
  })
})
