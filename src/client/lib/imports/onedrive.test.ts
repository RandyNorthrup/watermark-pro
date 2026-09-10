import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import { setOfflineUser } from '../offline-context'
import {
  downloadOneDriveImage,
  listOneDriveImages,
  mapGraphChildren,
  oneDriveChildrenUrl,
  type OneDriveImage,
} from './onedrive'
import { MICROSOFT_GRAPH_ROOT } from '../../../shared/constants'

beforeEach(() => setOfflineUser('user-1'))

afterEach(() => {
  vi.unstubAllGlobals()
})

/** A representative Graph `/children` payload: a folder, an image, and two items to drop. */
const graphChildren = {
  value: [
    { id: 'fold-1', name: 'Trips', folder: { childCount: 3 } },
    {
      id: 'img-1',
      name: 'beach.jpg',
      file: { mimeType: 'image/jpeg' },
      '@microsoft.graph.downloadUrl': 'https://public.dm.files.1drv.com/beach.jpg',
    },
    { id: 'doc-1', name: 'notes.pdf', file: { mimeType: 'application/pdf' } },
    {
      id: 'img-2',
      name: 'no-link.png',
      file: { mimeType: 'image/png' },
    },
  ],
}

describe('oneDriveChildrenUrl', () => {
  it('targets the drive root when no folder is given', () => {
    expect(oneDriveChildrenUrl()).toBe(`${MICROSOFT_GRAPH_ROOT}/me/drive/root/children`)
  })

  it('targets a specific folder by id', () => {
    expect(oneDriveChildrenUrl('fold-1')).toBe(
      `${MICROSOFT_GRAPH_ROOT}/me/drive/items/fold-1/children`,
    )
  })
})

describe('mapGraphChildren', () => {
  it('keeps folders and image files, dropping non-images', () => {
    const items = mapGraphChildren(graphChildren)
    expect(items).toEqual([
      { kind: 'folder', id: 'fold-1', name: 'Trips' },
      {
        kind: 'image',
        id: 'img-1',
        name: 'beach.jpg',
        mimeType: 'image/jpeg',
        downloadUrl: 'https://public.dm.files.1drv.com/beach.jpg',
      },
    ])
  })

  it('drops an image file that carries no download URL', () => {
    const items = mapGraphChildren(graphChildren)
    expect(items.some((item) => item.id === 'img-2')).toBe(false)
  })

  it('returns an empty list for an empty listing', () => {
    expect(mapGraphChildren({ value: [] })).toEqual([])
  })

  it('rejects a payload that is not a Graph children response', () => {
    expect(() => mapGraphChildren({ items: [] })).toThrow()
  })
})

describe('listOneDriveImages', () => {
  it('follows same-folder pages and never follows an attacker next link with the bearer token', async () => {
    const next = `${MICROSOFT_GRAPH_ROOT}/me/drive/root/children?$skiptoken=next`
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ ...graphChildren, '@odata.nextLink': next }))
      .mockResolvedValueOnce(
        Response.json({ value: [{ id: 'last', name: 'Last folder', folder: {} }] }),
      )
      .mockResolvedValueOnce(
        Response.json({ value: [], '@odata.nextLink': 'https://attacker.example/collect' }),
      )
    vi.stubGlobal('fetch', fetcher)
    expect(await listOneDriveImages('token')).toHaveLength(3)
    expect(fetcher.mock.calls[1]?.[0]).toBe(next)
    await expect(listOneDriveImages('token')).rejects.toThrow('unexpected URL')
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
  it('sends the bearer token and maps the response', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(Response.json(graphChildren)))
    vi.stubGlobal('fetch', fetchMock)

    const items = await listOneDriveImages('token-abc')

    expect(items).toHaveLength(2)
    const call = fetchMock.mock.calls[0]
    expect(call?.[0]).toBe(`${MICROSOFT_GRAPH_ROOT}/me/drive/root/children`)
    expect(call?.[1]).toMatchObject({ headers: { Authorization: 'Bearer token-abc' } })
  })

  it('throws when Graph returns a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(null, { status: 401 }))),
    )

    await expect(listOneDriveImages('token-abc')).rejects.toThrow(/401/)
  })
})

describe('downloadOneDriveImage', () => {
  const image: OneDriveImage = {
    kind: 'image',
    id: 'img-1',
    name: 'beach.jpg',
    mimeType: 'image/jpeg',
    downloadUrl: 'https://public.dm.files.1drv.com/beach.jpg',
  }

  it('fetches the download URL and returns a typed File', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const file = await downloadOneDriveImage(image)

    expect(file).toBeInstanceOf(File)
    expect(file.name).toBe('beach.jpg')
    expect(file.type).toBe('image/jpeg')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://public.dm.files.1drv.com/beach.jpg')
  })

  it('throws when the download URL responds with a non-OK status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(null, { status: 404 }))),
    )

    await expect(downloadOneDriveImage(image)).rejects.toThrow(/beach\.jpg/)
  })
})
