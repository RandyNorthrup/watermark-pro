/**
 * Watermark library data access: presets and logo assets for the active
 * organization. Queries are keyed under the organization so switching
 * organizations never shows another organization's library.
 */
import { queryOptions } from '@tanstack/react-query'

import { fetchJson, sendNoContent } from './api'
import { type AssetDto, assetDtoSchema, assetListResponseSchema } from '../../shared/api'
import {
  type SaveWatermarkRequest,
  type WatermarkDto,
  watermarkDtoSchema,
  watermarkListResponseSchema,
} from '../../shared/api-watermark'

const JSON_HEADERS = { 'content-type': 'application/json' }

function libraryPath(organizationId: string, suffix: string): string {
  return `/api/orgs/${organizationId}${suffix}`
}

export function libraryQueryKey(organizationId: string) {
  return ['organization', organizationId, 'library'] as const
}

export function watermarksQueryOptions(organizationId: string) {
  return queryOptions({
    queryKey: [...libraryQueryKey(organizationId), 'watermarks'],
    queryFn: async () => {
      const response = await fetchJson(
        libraryPath(organizationId, '/watermarks'),
        watermarkListResponseSchema,
      )
      return response.watermarks
    },
  })
}

export function assetsQueryOptions(organizationId: string) {
  return queryOptions({
    queryKey: [...libraryQueryKey(organizationId), 'assets'],
    queryFn: async () => {
      const response = await fetchJson(
        libraryPath(organizationId, '/assets'),
        assetListResponseSchema,
      )
      return response.assets
    },
  })
}

/** URL the browser can load a logo from; same origin, session cookie applies. */
export function assetFileUrl(organizationId: string, assetId: string): string {
  return libraryPath(organizationId, `/assets/${assetId}/file`)
}

export function createWatermark(
  organizationId: string,
  body: SaveWatermarkRequest,
): Promise<WatermarkDto> {
  return fetchJson(libraryPath(organizationId, '/watermarks'), watermarkDtoSchema, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  })
}

export function updateWatermark(
  organizationId: string,
  watermarkId: string,
  body: SaveWatermarkRequest,
): Promise<WatermarkDto> {
  return fetchJson(libraryPath(organizationId, `/watermarks/${watermarkId}`), watermarkDtoSchema, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  })
}

export function deleteWatermark(organizationId: string, watermarkId: string): Promise<void> {
  return sendNoContent(libraryPath(organizationId, `/watermarks/${watermarkId}`), {
    method: 'DELETE',
  })
}

export interface LogoUpload {
  file: File
  name: string
  width: number
  height: number
}

export function uploadLogo(organizationId: string, upload: LogoUpload): Promise<AssetDto> {
  const form = new FormData()
  form.append('file', upload.file)
  form.append('name', upload.name)
  form.append('width', String(upload.width))
  form.append('height', String(upload.height))
  return fetchJson(libraryPath(organizationId, '/assets'), assetDtoSchema, {
    method: 'POST',
    body: form,
  })
}

export function deleteLogo(organizationId: string, assetId: string): Promise<void> {
  return sendNoContent(libraryPath(organizationId, `/assets/${assetId}`), { method: 'DELETE' })
}
