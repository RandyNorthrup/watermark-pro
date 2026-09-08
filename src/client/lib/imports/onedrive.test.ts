import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  downloadOneDriveImage,
  listOneDriveImages,
  mapGraphChildren,
  oneDriveChildrenUrl,
  oneDriveUploadUrl,
  uploadOneDriveImage,
  type OneDriveImage,
} from './onedrive'
import { CLOUD_SAVE_FOLDER, MICROSOFT_GRAPH_ROOT } from '../../../shared/constants'

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
      '@microsoft.graph.downloadUrl': 'https://dl.example.com/beach.jpg',
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
        downloadUrl: 'https://dl.example.com/beach.jpg',
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

describe('oneDriveUploadUrl', () => {
  it('addresses the save folder at the root and percent-encodes both segments', () => {
    expect(oneDriveUploadUrl('a b&c.png')).toBe(
      `${MICROSOFT_GRAPH_ROOT}/me/drive/root:/${encodeURIComponent(CLOUD_SAVE_FOLDER)}/a%20b%26c.png:/content`,
    )
  })
})

describe('uploadOneDriveImage', () => {
  it('PUTs the blob with the bearer token to the upload URL', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(null, { status: 201 })),
    )
    vi.stubGlobal('fetch', fetchMock)

    await uploadOneDriveImage('token-xyz', {
      name: 'mark.png',
      blob: new Blob([new Uint8Array([1])], { type: 'image/png' }),
    })

    const call = fetchMock.mock.calls[0]
    expect(call?.[0]).toBe(oneDriveUploadUrl('mark.png'))
    expect(call?.[1]).toMatchObject({
      method: 'PUT',
      headers: { Authorization: 'Bearer token-xyz', 'Content-Type': 'image/png' },
    })
  })

  it('throws when the upload responds with a non-OK status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(null, { status: 507 }))),
    )

    await expect(
      uploadOneDriveImage('token-xyz', { name: 'mark.png', blob: new Blob([]) }),
    ).rejects.toThrow(/mark\.png/)
  })
})

describe('downloadOneDriveImage', () => {
  const image: OneDriveImage = {
    kind: 'image',
    id: 'img-1',
    name: 'beach.jpg',
    mimeType: 'image/jpeg',
    downloadUrl: 'https://dl.example.com/beach.jpg',
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
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://dl.example.com/beach.jpg')
  })

  it('throws when the download URL responds with a non-OK status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(null, { status: 404 }))),
    )

    await expect(downloadOneDriveImage(image)).rejects.toThrow(/beach\.jpg/)
  })
})
