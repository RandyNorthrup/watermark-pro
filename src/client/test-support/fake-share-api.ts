import type { FakeGalleryState } from './fake-gallery-api'
import type { ShareDto } from '../../shared/api'
import { HTTP_STATUS } from '../../shared/constants'

/**
 * In-memory share routes for page tests, mounted by `fake-library-api`.
 * Tokens are `fake.<id>` so the public page can be exercised by id.
 */
export interface FakeShareState {
  shares: ShareDto[]
}

const ORIGIN = 'http://localhost:5173'
const ROUTE = /^\/api\/orgs\/(?<org>[^/]+)\/shares(?:\/(?<id>[^/]+))?(?<revoke>\/revoke)?$/
const PUBLIC_ROUTE =
  /^\/api\/share\/(?<token>[^/]+)(?:\/photos\/(?<photoId>[^/]+)\/(?<kind>file|thumbnail))?$/

let nextId = 1

export function makeShare(overrides: Partial<ShareDto> = {}): ShareDto {
  const id = overrides.id ?? 'share-1'
  return {
    id,
    organizationId: 'org-1',
    title: 'Client preview',
    photoCount: 2,
    expiresAt: null,
    revokedAt: null,
    createdBy: 'user-1',
    createdAt: '2026-09-05T10:00:00.000Z',
    url: `${ORIGIN}/share/fake.${id}`,
    ...overrides,
  }
}

export function fakeShareToken(id: string): string {
  return `fake.${id}`
}

function readJson(init: RequestInit): unknown {
  return typeof init.body === 'string' ? JSON.parse(init.body) : null
}

export function handleShares(
  state: FakeShareState,
  gallery: FakeGalleryState,
  url: string,
  init: RequestInit,
): Response | null {
  const pathname = new URL(url, 'http://localhost').pathname
  const method = init.method ?? 'GET'
  const owned = ROUTE.exec(pathname)
  if (owned?.groups !== undefined) {
    const { id, revoke } = owned.groups
    if (method === 'GET' && id === undefined) {
      return Response.json({ shares: state.shares })
    }
    if (method === 'POST' && id === undefined) {
      const body = readJson(init) as { title: string; photoIds: string[]; expiresInDays?: number }
      nextId += 1
      const created = makeShare({
        id: `share-${String(nextId)}`,
        title: body.title,
        photoCount: new Set(body.photoIds).size,
        expiresAt:
          body.expiresInDays === undefined
            ? null
            : new Date(Date.now() + body.expiresInDays * 86_400_000).toISOString(),
        createdAt: new Date().toISOString(),
      })
      state.shares.unshift(created)
      return Response.json(created, { status: HTTP_STATUS.created })
    }
    if (method === 'POST' && id !== undefined && revoke !== undefined) {
      const share = state.shares.find((candidate) => candidate.id === id)
      if (share?.revokedAt !== null) {
        return Response.json({ error: 'not_found' }, { status: HTTP_STATUS.notFound })
      }
      share.revokedAt = new Date().toISOString()
      return Response.json(share)
    }
    return null
  }
  const open = PUBLIC_ROUTE.exec(pathname)
  if (method !== 'GET' || open?.groups === undefined) {
    return null
  }
  const { token, photoId, kind } = open.groups
  const share = state.shares.find(
    (candidate) => fakeShareToken(candidate.id) === token && candidate.revokedAt === null,
  )
  if (share === undefined) {
    return Response.json({ error: 'not_found' }, { status: HTTP_STATUS.notFound })
  }
  if (photoId !== undefined && kind !== undefined) {
    return new Response(new Uint8Array([0xff, 0xd8]), { headers: { 'content-type': 'image/jpeg' } })
  }
  return Response.json({
    title: share.title,
    expiresAt: share.expiresAt,
    photos: gallery.photos.slice(0, share.photoCount).map((photo) => ({
      id: photo.id,
      name: photo.name,
      width: photo.width,
      height: photo.height,
      contentType: photo.contentType,
    })),
  })
}
