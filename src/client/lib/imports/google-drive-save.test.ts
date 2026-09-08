import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildFolderQuery,
  buildMultipartBody,
  createFolder,
  findFolderId,
  folderSearchUrl,
  uploadFile,
} from './google-drive-save'
import {
  CLOUD_SAVE_FOLDER,
  GOOGLE_DRIVE_FILES_ENDPOINT,
  GOOGLE_DRIVE_UPLOAD_ENDPOINT,
  HTTP_STATUS,
} from '../../../shared/constants'

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder'
const MULTIPART_UPLOAD_URL = `${GOOGLE_DRIVE_UPLOAD_ENDPOINT}?uploadType=multipart`

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('buildFolderQuery', () => {
  it('matches a non-trashed folder with the save-folder name', () => {
    const query = buildFolderQuery(CLOUD_SAVE_FOLDER)
    expect(query).toContain(`mimeType = '${FOLDER_MIME_TYPE}'`)
    expect(query).toContain(`name = '${CLOUD_SAVE_FOLDER}'`)
    expect(query).toContain('trashed = false')
  })

  it('escapes single quotes and backslashes so a name cannot break the literal', () => {
    expect(buildFolderQuery(String.raw`a'b\c`)).toContain(String.raw`name = 'a\'b\\c'`)
  })
})

describe('folderSearchUrl', () => {
  it('targets the Drive files endpoint with the query and field mask encoded', () => {
    const url = folderSearchUrl(CLOUD_SAVE_FOLDER)
    expect(url.startsWith(`${GOOGLE_DRIVE_FILES_ENDPOINT}?`)).toBe(true)
    const params = new URL(url).searchParams
    expect(params.get('q')).toBe(buildFolderQuery(CLOUD_SAVE_FOLDER))
    expect(params.get('fields')).toBe('files(id)')
  })
})

describe('buildMultipartBody', () => {
  it('embeds the metadata JSON and the boundary in a multipart/related body', async () => {
    const metadata = { name: 'photo.png', parents: ['folder-1'] }
    const result = buildMultipartBody(
      metadata,
      new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    )

    expect(result.contentType).toBe(`multipart/related; boundary=${result.boundary}`)
    const text = await result.body.text()
    expect(text).toContain(JSON.stringify(metadata))
    expect(text).toContain(`--${result.boundary}`)
    expect(text).toContain(`--${result.boundary}--`)
    expect(text).toContain('Content-Type: application/json')
    expect(text).toContain('Content-Type: image/png')
  })

  it('generates a distinct boundary per call', () => {
    const first = buildMultipartBody({ name: 'a', parents: ['f'] }, new Blob(['x']))
    const second = buildMultipartBody({ name: 'a', parents: ['f'] }, new Blob(['x']))
    expect(first.boundary).not.toBe(second.boundary)
  })

  it('falls back to octet-stream when the blob carries no type', async () => {
    const result = buildMultipartBody({ name: 'a', parents: ['f'] }, new Blob(['x']))
    expect(await result.body.text()).toContain('Content-Type: application/octet-stream')
  })
})

describe('findFolderId', () => {
  it('returns the id of the first matching folder', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json({ files: [{ id: 'folder-42' }] }, { status: HTTP_STATUS.ok })),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(findFolderId('token-1', CLOUD_SAVE_FOLDER)).resolves.toBe('folder-42')
    const call = fetchMock.mock.calls[0]
    expect(call?.[0]).toBe(folderSearchUrl(CLOUD_SAVE_FOLDER))
    expect(call?.[1]).toMatchObject({ headers: { Authorization: 'Bearer token-1' } })
  })

  it('returns null when no folder matches', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() =>
        Promise.resolve(Response.json({ files: [] }, { status: HTTP_STATUS.ok })),
      ),
    )
    await expect(findFolderId('token', CLOUD_SAVE_FOLDER)).resolves.toBeNull()
  })

  it('rejects with a readable Error on a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() =>
        Promise.resolve(new Response(null, { status: HTTP_STATUS.internalServerError })),
      ),
    )
    await expect(findFolderId('token', CLOUD_SAVE_FOLDER)).rejects.toThrow(
      `Could not search Google Drive for the "${CLOUD_SAVE_FOLDER}" folder (HTTP 500).`,
    )
  })
})

describe('createFolder', () => {
  it('posts the folder name and folder mimeType and returns the new id', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json({ id: 'created-7' }, { status: HTTP_STATUS.ok })),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(createFolder('token-2', CLOUD_SAVE_FOLDER)).resolves.toBe('created-7')
    const call = fetchMock.mock.calls[0]
    expect(call?.[0]).toBe(GOOGLE_DRIVE_FILES_ENDPOINT)
    expect(call?.[1]).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer token-2', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: CLOUD_SAVE_FOLDER, mimeType: FOLDER_MIME_TYPE }),
    })
  })

  it('rejects with a readable Error on a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() =>
        Promise.resolve(new Response(null, { status: HTTP_STATUS.internalServerError })),
      ),
    )
    await expect(createFolder('token', CLOUD_SAVE_FOLDER)).rejects.toThrow(
      `Could not create the "${CLOUD_SAVE_FOLDER}" folder in Google Drive (HTTP 500).`,
    )
  })
})

describe('uploadFile', () => {
  it('uploads to the multipart endpoint with the bearer token and multipart content type', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(null, { status: HTTP_STATUS.ok })),
    )
    vi.stubGlobal('fetch', fetchMock)

    const blob = new Blob([new Uint8Array([9])], { type: 'image/jpeg' })
    await expect(
      uploadFile('token-3', 'folder-9', { name: 'sunset.jpg', blob }),
    ).resolves.toBeUndefined()

    const call = fetchMock.mock.calls[0]
    expect(call?.[0]).toBe(MULTIPART_UPLOAD_URL)
    const init = call?.[1]
    expect(init?.method).toBe('POST')
    expect(init?.body).toBeInstanceOf(Blob)
    const headers = init?.headers
    expect(headers).toMatchObject({ Authorization: 'Bearer token-3' })
    const contentType =
      headers !== undefined && !(headers instanceof Headers) && !Array.isArray(headers)
        ? headers['Content-Type']
        : undefined
    expect(contentType).toContain('multipart/related; boundary=')
  })

  it('rejects with an Error naming the file and status on a failed upload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() =>
        Promise.resolve(new Response(null, { status: HTTP_STATUS.internalServerError })),
      ),
    )
    const blob = new Blob(['x'], { type: 'image/png' })
    await expect(uploadFile('token', 'folder', { name: 'broken.png', blob })).rejects.toThrow(
      'Could not save broken.png to Google Drive (HTTP 500).',
    )
  })
})
