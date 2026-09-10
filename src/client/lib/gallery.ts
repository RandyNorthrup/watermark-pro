/**
 * Stored photos: gallery queries and the upload/delete mutations. Uploads
 * build the thumbnail in the browser so the Worker never decodes images.
 */
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import type { z } from 'zod'

import { fetchJson } from './api'
import { cachedWorkspaceJson } from './offline-cache'
import { captureOfflineOwner, hasOfflineDatabase, offlineUserId } from './offline-context'
import { offlineRecordKey, readOfflineRecord } from './offline-database'
import { workspaceCacheReconciliation } from './offline-reconciliation'
import { deleteLocally, mergeLocalPhotos, savePhotoLocally } from './offline-workspace'
import { noteRecentWork } from './recent-work-events'
import { createThumbnail } from './thumbnail'
import {
  type PhotoDto,
  photoDeleteResponseSchema,
  photoDtoSchema,
  photoListResponseSchema,
  storageUsageSchema,
} from '../../shared/api'

export interface GalleryFilters {
  presetId?: string | undefined
  search?: string | undefined
}

function galleryPath(organizationId: string, suffix = ''): string {
  return `/api/orgs/${organizationId}/photos${suffix}`
}

export function galleryQueryKey(organizationId: string) {
  return ['organization', organizationId, 'gallery'] as const
}

/** Newly typed offline searches reuse the prepared complete gallery, rather than requiring that exact URL to have been visited. */
async function cachedGallery(organizationId: string) {
  const owner = captureOfflineOwner()
  const photos: PhotoDto[] = []
  const cursors = new Set<string>()
  let path = galleryPath(organizationId)
  for (;;) {
    const record = await readOfflineRecord(offlineRecordKey(owner.userId, organizationId, path))
    owner.assertCurrent()
    if (record?.userId !== owner.userId || record.organizationId !== organizationId) {
      throw new Error('Connect once to prepare the full gallery for offline search.')
    }
    const page = photoListResponseSchema.parse(record.value)
    photos.push(...page.photos)
    if (page.nextCursor === null) {
      return { photos, nextCursor: null }
    }
    if (cursors.has(page.nextCursor)) {
      throw new Error('The cached gallery has a repeated page. Reconnect to refresh it.')
    }
    cursors.add(page.nextCursor)
    path = galleryPath(organizationId, `?cursor=${encodeURIComponent(page.nextCursor)}`)
  }
}

export function photosQueryOptions(organizationId: string, filters: GalleryFilters) {
  return infiniteQueryOptions({
    queryKey: [...galleryQueryKey(organizationId), 'photos', filters],
    networkMode: 'always',
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams()
      if (filters.presetId !== undefined && filters.presetId !== '') {
        params.set('presetId', filters.presetId)
      }
      if (filters.search !== undefined && filters.search !== '') {
        params.set('search', filters.search)
      }
      if (pageParam !== null) {
        params.set('cursor', pageParam)
      }
      const query = params.size === 0 ? '' : `?${params.toString()}`
      let isCached = false
      const reconcile =
        hasOfflineDatabase() && params.size === 0
          ? await workspaceCacheReconciliation(organizationId, 'photo')
          : undefined
      let response: z.infer<typeof photoListResponseSchema>
      try {
        response = await cachedWorkspaceJson(
          organizationId,
          galleryPath(organizationId, query),
          photoListResponseSchema,
          async (value) =>
            await reconcile?.(
              value.photos.map((photo) => photo.id),
              value.nextCursor === null,
            ),
          () => {
            isCached = true
          },
        )
      } catch (error) {
        if (
          pageParam !== null ||
          params.size === 0 ||
          !(error instanceof Error) ||
          !(error.cause instanceof TypeError)
        ) {
          throw error
        }
        isCached = true
        response = await cachedGallery(organizationId)
      }
      if (pageParam !== null || !hasOfflineDatabase()) {
        return response
      }
      const photos = await mergeLocalPhotos(organizationId, response.photos, isCached)
      return {
        ...response,
        photos: photos.filter(
          (photo) =>
            ([undefined, ''].includes(filters.presetId) || photo.presetId === filters.presetId) &&
            (filters.search === undefined ||
              photo.name.toLocaleLowerCase().includes(filters.search.toLocaleLowerCase())),
        ),
      }
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  })
}

export function storageUsageQueryOptions(organizationId: string) {
  return queryOptions({
    queryKey: [...galleryQueryKey(organizationId), 'usage'],
    networkMode: 'always',
    queryFn: () =>
      cachedWorkspaceJson(
        organizationId,
        galleryPath(organizationId, '/usage'),
        storageUsageSchema,
      ),
  })
}

export function photoFileUrl(organizationId: string, photoId: string): string {
  return galleryPath(organizationId, `/${photoId}/file`)
}

export function photoThumbnailUrl(organizationId: string, photoId: string): string {
  return galleryPath(organizationId, `/${photoId}/thumbnail`)
}

export interface PhotoUpload {
  blob: Blob
  name: string
  width: number
  height: number
  presetId?: string | null | undefined
}

export async function uploadPhoto(organizationId: string, upload: PhotoUpload): Promise<PhotoDto> {
  const owner = captureOfflineOwner()
  const thumbnail = await createThumbnail(upload.blob)
  owner.assertCurrent()
  if (hasOfflineDatabase()) {
    const photo = photoDtoSchema.parse({
      id: crypto.randomUUID(),
      organizationId,
      name: upload.name,
      contentType: upload.blob.type,
      size: upload.blob.size,
      width: upload.width,
      height: upload.height,
      presetId: upload.presetId ?? null,
      presetName: null,
      createdBy: offlineUserId(),
      createdAt: new Date().toISOString(),
    })
    const saved = await savePhotoLocally(organizationId, photo, upload.blob, thumbnail.blob)
    owner.assertCurrent()
    noteRecentWork(organizationId, { kind: 'photo', photo: saved })
    return saved
  }
  const form = new FormData()
  form.append('file', upload.blob, upload.name)
  form.append('thumbnail', thumbnail.blob, 'thumbnail.jpg')
  form.append('name', upload.name)
  form.append('width', String(upload.width))
  form.append('height', String(upload.height))
  if (upload.presetId !== undefined && upload.presetId !== null) {
    form.append('presetId', upload.presetId)
  }
  const saved = await fetchJson(galleryPath(organizationId), photoDtoSchema, {
    method: 'POST',
    body: form,
  })
  owner.assertCurrent()
  noteRecentWork(organizationId, { kind: 'photo', photo: saved })
  return saved
}

export async function deletePhotos(
  organizationId: string,
  ids: readonly string[],
): Promise<number> {
  if (hasOfflineDatabase()) {
    await deleteLocally(organizationId, { kind: 'photo-delete', photoIds: [...ids] })
    return ids.length
  }
  const response = await fetchJson(
    galleryPath(organizationId, '/delete'),
    photoDeleteResponseSchema,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids }),
    },
  )
  return response.deleted
}
