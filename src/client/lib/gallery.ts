/**
 * Stored photos: gallery queries and the upload/delete mutations. Uploads
 * build the thumbnail in the browser so the Worker never decodes images.
 */
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'

import { fetchJson } from './api'
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

export function photosQueryOptions(organizationId: string, filters: GalleryFilters) {
  return infiniteQueryOptions({
    queryKey: [...galleryQueryKey(organizationId), 'photos', filters],
    queryFn: ({ pageParam }) => {
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
      return fetchJson(galleryPath(organizationId, query), photoListResponseSchema)
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  })
}

export function storageUsageQueryOptions(organizationId: string) {
  return queryOptions({
    queryKey: [...galleryQueryKey(organizationId), 'usage'],
    queryFn: () => fetchJson(galleryPath(organizationId, '/usage'), storageUsageSchema),
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
  const thumbnail = await createThumbnail(upload.blob)
  const form = new FormData()
  form.append('file', upload.blob, upload.name)
  form.append('thumbnail', thumbnail.blob, 'thumbnail.jpg')
  form.append('name', upload.name)
  form.append('width', String(upload.width))
  form.append('height', String(upload.height))
  if (upload.presetId !== undefined && upload.presetId !== null) {
    form.append('presetId', upload.presetId)
  }
  return await fetchJson(galleryPath(organizationId), photoDtoSchema, {
    method: 'POST',
    body: form,
  })
}

export async function deletePhotos(
  organizationId: string,
  ids: readonly string[],
): Promise<number> {
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
