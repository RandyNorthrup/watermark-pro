import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CLOUD_ROOT_FOLDER,
  createCloudFolder,
  downloadCloudFile,
  listCloudFolder,
} from './cloud-folders'
import { toCloudFile } from './cloud-media'
import { setOfflineUser } from '../offline-context'

function requestUrl(input: RequestInfo | URL | undefined): string {
  if (input === undefined) throw new Error('Missing request')
  return input instanceof Request ? input.url : input.toString()
}

beforeEach(() => setOfflineUser('owner'))
afterEach(() => vi.unstubAllGlobals())
const GRAPH = 'https://graph.microsoft.com/v1.0/me/drive/root/children'
const DOWNLOAD = 'https://public.files.1drv.com/original'
const graphChildren = {
  value: [
    { id: 'folder', name: 'Trips', folder: {} },
    {
      id: 'photo',
      name: 'photo.jpg',
      file: { mimeType: 'image/jpeg' },
      '@microsoft.graph.downloadUrl': DOWNLOAD,
    },
    {
      id: 'pdf',
      name: 'original.pdf',
      file: { mimeType: 'application/pdf' },
      '@microsoft.graph.downloadUrl': DOWNLOAD,
    },
    {
      id: 'video',
      name: 'movie.mp4',
      file: { mimeType: 'video/mp4' },
      '@microsoft.graph.downloadUrl': DOWNLOAD,
    },
    { id: 'missing-link', name: 'lost.png', file: { mimeType: 'image/png' } },
  ],
}

describe('durable provider folder browser', () => {
  it('keeps image defaults and includes PDF/video only for the requested tool', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json(graphChildren))),
    )
    const images = await listCloudFolder('onedrive', 'token', CLOUD_ROOT_FOLDER)
    const media = await listCloudFolder('onedrive', 'token', CLOUD_ROOT_FOLDER, [
      'document',
      'video',
    ])
    expect(images.map((item) => item.id)).toEqual(['folder', 'photo'])
    expect(media.map((item) => item.id)).toEqual(['folder', 'pdf', 'video'])
  })

  it('follows only same-folder pages and rejects credentialed, foreign and repeated next links', async () => {
    const next = `${GRAPH}?$skiptoken=next`
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ ...graphChildren, '@odata.nextLink': next }))
      .mockResolvedValueOnce(Response.json({ value: [] }))
    vi.stubGlobal('fetch', fetcher)
    expect(await listCloudFolder('onedrive', 'token', CLOUD_ROOT_FOLDER)).toHaveLength(2)
    expect(fetcher.mock.calls[1]?.[0]).toBe(next)
    for (const link of [
      'https://attacker.test/collect',
      GRAPH.replace('/root/', '/items/foreign/'),
      GRAPH.replace('https://', 'https://user@'),
    ]) {
      fetcher.mockResolvedValueOnce(Response.json({ value: [], '@odata.nextLink': link }))
      await expect(listCloudFolder('onedrive', 'token', CLOUD_ROOT_FOLDER)).rejects.toThrow(
        'unexpected page link',
      )
    }
    fetcher.mockImplementation(() =>
      Promise.resolve(Response.json({ value: [], '@odata.nextLink': next })),
    )
    await expect(listCloudFolder('onedrive', 'token', CLOUD_ROOT_FOLDER)).rejects.toThrow(
      'invalid folder listing',
    )
    expect(fetcher).toHaveBeenCalledTimes(7)
  })

  it('navigates Google authorized folders, escapes search values and omits native documents', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        files: [
          { id: 'folder', name: 'More', mimeType: 'application/vnd.google-apps.folder' },
          { id: 'pdf', name: 'Original.pdf', mimeType: 'application/pdf' },
          { id: 'native', name: 'Draft', mimeType: 'application/vnd.google-apps.document' },
        ],
      }),
    )
    vi.stubGlobal('fetch', fetcher)
    const items = await listCloudFolder(
      'google',
      'token',
      { id: "folder'quoted", name: 'Folder' },
      ['document'],
    )
    expect(items.map((item) => item.id)).toEqual(['folder', 'pdf'])
    const url = new URL(requestUrl(fetcher.mock.calls[0]?.[0]))
    expect(url.searchParams.get('q')).toBe(
      String.raw`'folder\'quoted' in parents and trashed = false`,
    )
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      redirect: 'error',
      headers: { Authorization: 'Bearer token' },
    })
  })

  it('follows Dropbox cursors inside the granted folder and creates nested destinations without renaming', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          entries: [{ '.tag': 'folder', id: 'id:folder', name: 'Work', path_lower: '/work' }],
          has_more: true,
          cursor: 'page2',
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          entries: [{ '.tag': 'file', id: 'id:pdf', name: 'Original.pdf' }],
          has_more: false,
          cursor: 'end',
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ metadata: { id: 'id:new', name: 'Final', path_lower: '/work/final' } }),
      )
    vi.stubGlobal('fetch', fetcher)
    expect(await listCloudFolder('dropbox', 'token', CLOUD_ROOT_FOLDER, ['document'])).toHaveLength(
      2,
    )
    expect(fetcher.mock.calls[0]?.[1]?.body).toBe(
      '{"path":"","recursive":false,"include_deleted":false}',
    )
    expect(fetcher.mock.calls[1]?.[1]?.body).toBe('{"cursor":"page2"}')
    expect(
      await createCloudFolder(
        'dropbox',
        'token',
        { id: 'id:folder', name: 'Work', path: '/work' },
        'Final',
      ),
    ).toEqual({ id: 'id:new', name: 'Final', path: '/work/final' })
    expect(fetcher.mock.calls[2]?.[1]?.body).toBe('{"path":"/work/Final","autorename":false}')
    await expect(
      createCloudFolder('dropbox', 'token', CLOUD_ROOT_FOLDER, '../Escape'),
    ).rejects.toThrow()
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('downloads original PDF bytes from temporary URLs without sending a bearer header', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ link: 'https://content.dropboxusercontent.com/original' }),
      )
      .mockResolvedValueOnce(new Response('ORIGINAL PDF BYTES'))
    vi.stubGlobal('fetch', fetcher)
    const file = await downloadCloudFile(
      'dropbox',
      'private-token',
      { id: 'id:pdf', name: 'Original.pdf', mimeType: '', kind: 'file' },
      ['document'],
    )
    expect(file.type).toBe('application/pdf')
    expect(await file.text()).toBe('ORIGINAL PDF BYTES')
    expect(new Headers(fetcher.mock.calls[1]?.[1]?.headers).has('Authorization')).toBe(false)
    fetcher.mockResolvedValueOnce(Response.json({ link: 'https://attacker.test/collect' }))
    await expect(
      downloadCloudFile(
        'dropbox',
        'private-token',
        { id: 'id:pdf', name: 'Original.pdf', mimeType: '', kind: 'file' },
        ['document'],
      ),
    ).rejects.toThrow('unexpected')
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(() =>
      toCloudFile(new Blob(['bytes']), 'draft.pdf', 'application/pdf', ['image']),
    ).toThrow('not supported')
    expect(() =>
      toCloudFile(new Blob(['bytes']), '../draft.pdf', 'application/pdf', ['document']),
    ).toThrow()
  })
})
