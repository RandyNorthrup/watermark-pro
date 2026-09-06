import type { PhotoDto } from '../../shared/api'
import { HTTP_STATUS, PHOTO_PAGE_SIZE } from '../../shared/constants'

/**
 * In-memory photo routes for page tests, mounted by `fake-library-api`.
 * Mirrors the Worker's list ordering, cursor paging, filters and quotas
 * closely enough for the gallery, editor and bulk pages.
 */
export interface FakeGalleryState {
  photos: PhotoDto[]
  maxBytes: number
  /** When set, uploads fail with this code. */
  uploadFailsWith: 'quotaExceeded' | 'unsupportedMedia' | null
}

export function makePhoto(overrides: Partial<PhotoDto> = {}): PhotoDto {
  return {
    id: 'photo-1',
    organizationId: 'org-1',
    name: 'beach-watermarked.jpg',
    contentType: 'image/jpeg',
    size: 512_000,
    width: 4000,
    height: 3000,
    presetId: 'wm-1',
    presetName: 'Studio signature',
    createdBy: 'user-1',
    createdAt: '2026-09-05T10:00:00.000Z',
    ...overrides,
  }
}

const ROUTE = /^\/api\/orgs\/(?<org>[^/]+)\/photos(?:\/(?<id>[^/]+))?(?<sub>\/file|\/thumbnail)?$/

let nextId = 100

function sortNewest(photos: readonly PhotoDto[]): PhotoDto[] {
  return photos.toSorted(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
  )
}

function text(form: FormData, key: string): string {
  const value = form.get(key)
  return typeof value === 'string' ? value : ''
}

function cursorOf(photo: PhotoDto): string {
  return `${String(new Date(photo.createdAt).getTime())}:${photo.id}`
}

export function handleGallery(
  state: FakeGalleryState,
  url: string,
  init: RequestInit,
): Response | null {
  const parsed = new URL(url, 'http://localhost')
  const match = ROUTE.exec(parsed.pathname)
  if (match?.groups === undefined) {
    return null
  }
  const method = init.method ?? 'GET'
  const { id, sub } = match.groups
  if (method === 'GET' && id === 'usage') {
    return Response.json({
      count: state.photos.length,
      bytes: state.photos.reduce((total, photo) => total + photo.size, 0),
      maxCount: 10_000,
      maxBytes: state.maxBytes,
    })
  }
  if (method === 'GET' && id === undefined) {
    let rows = sortNewest(state.photos)
    const presetId = parsed.searchParams.get('presetId')
    const search = parsed.searchParams.get('search')?.toLowerCase()
    const cursor = parsed.searchParams.get('cursor')
    if (presetId !== null) {
      rows = rows.filter((photo) => photo.presetId === presetId)
    }
    if (search !== undefined && search !== '') {
      rows = rows.filter((photo) => photo.name.toLowerCase().includes(search))
    }
    if (cursor !== null) {
      const index = rows.findIndex((photo) => cursorOf(photo) === cursor)
      rows = index === -1 ? [] : rows.slice(index + 1)
    }
    const page = rows.slice(0, PHOTO_PAGE_SIZE)
    const last = page.at(-1)
    return Response.json({
      photos: page,
      nextCursor: last !== undefined && rows.length > PHOTO_PAGE_SIZE ? cursorOf(last) : null,
    })
  }
  if (method === 'GET' && id !== undefined && sub !== undefined) {
    return state.photos.some((photo) => photo.id === id)
      ? new Response(new Uint8Array([0xff, 0xd8]), { headers: { 'content-type': 'image/jpeg' } })
      : Response.json({ error: 'not_found' }, { status: HTTP_STATUS.notFound })
  }
  if (method === 'POST' && id === undefined) {
    if (state.uploadFailsWith !== null) {
      const code =
        state.uploadFailsWith === 'quotaExceeded' ? 'quota_exceeded' : 'unsupported_media'
      return Response.json(
        { error: code },
        {
          status:
            state.uploadFailsWith === 'quotaExceeded'
              ? HTTP_STATUS.badRequest
              : HTTP_STATUS.unsupportedMediaType,
        },
      )
    }
    const form = init.body
    if (!(form instanceof FormData)) {
      return Response.json({ error: 'validation_failed' }, { status: HTTP_STATUS.badRequest })
    }
    const file = form.get('file')
    const presetId = form.get('presetId')
    nextId += 1
    const created = makePhoto({
      id: `photo-${String(nextId)}`,
      name: text(form, 'name'),
      size: file instanceof Blob ? file.size : 0,
      width: Number(text(form, 'width')),
      height: Number(text(form, 'height')),
      presetId: typeof presetId === 'string' ? presetId : null,
      createdAt: new Date(Date.now() + nextId).toISOString(),
    })
    state.photos.push(created)
    return Response.json(created, { status: HTTP_STATUS.created })
  }
  if (method === 'POST' && id === 'delete') {
    if (typeof init.body !== 'string') {
      return Response.json({ error: 'validation_failed' }, { status: HTTP_STATUS.badRequest })
    }
    const { ids } = JSON.parse(init.body) as { ids: string[] }
    const before = state.photos.length
    state.photos = state.photos.filter((photo) => !ids.includes(photo.id))
    return Response.json({ deleted: before - state.photos.length })
  }
  return null
}
