/**
 * Share links: creation, listing and revocation for members, and the
 * public view for visitors holding a token. Public calls use the same
 * origin and carry no credentials.
 */
import { queryOptions } from '@tanstack/react-query'

import { fetchJson } from './api'
import {
  publicShareSchema,
  type ShareCreateRequest,
  type ShareDto,
  shareDtoSchema,
  shareListResponseSchema,
} from '../../shared/api'

const JSON_HEADERS = { 'content-type': 'application/json' }

export function sharesQueryKey(organizationId: string) {
  return ['organization', organizationId, 'shares'] as const
}

export function sharesQueryOptions(organizationId: string) {
  return queryOptions({
    queryKey: sharesQueryKey(organizationId),
    queryFn: async () => {
      const response = await fetchJson(
        `/api/orgs/${organizationId}/shares`,
        shareListResponseSchema,
      )
      return response.shares
    },
  })
}

export function createShare(organizationId: string, body: ShareCreateRequest): Promise<ShareDto> {
  return fetchJson(`/api/orgs/${organizationId}/shares`, shareDtoSchema, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  })
}

export function revokeShare(organizationId: string, shareId: string): Promise<ShareDto> {
  return fetchJson(`/api/orgs/${organizationId}/shares/${shareId}/revoke`, shareDtoSchema, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: '{}',
  })
}

export function publicShareQueryOptions(token: string) {
  return queryOptions({
    queryKey: ['share', token],
    queryFn: () => fetchJson(`/api/share/${token}`, publicShareSchema, { credentials: 'omit' }),
    retry: false,
  })
}

export function sharedPhotoUrl(token: string, photoId: string, kind: 'file' | 'thumbnail'): string {
  return `/api/share/${token}/photos/${photoId}/${kind}`
}

/**
 * Hands a link to the platform share sheet when the browser offers one
 * (`navigator.share`), otherwise copies it to the clipboard. Returns which
 * happened so the caller can word its confirmation.
 */
export async function shareLink(title: string, url: string): Promise<'shared' | 'copied'> {
  const data = { title, url }
  if (canUseShareSheet(data)) {
    try {
      await navigator.share(data)
      return 'shared'
    } catch (error) {
      // The user dismissed the sheet; fall through to the clipboard only for other failures.
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'shared'
      }
    }
  }
  await copyLink(url)
  return 'copied'
}

/** `navigator.share` is absent on desktop browsers; TypeScript types it as always present. */
function canUseShareSheet(data: ShareData): boolean {
  const candidate = navigator as Partial<Pick<Navigator, 'share' | 'canShare'>>
  if (typeof candidate.share !== 'function') {
    return false
  }
  return typeof candidate.canShare === 'function' ? candidate.canShare(data) : true
}

export async function copyLink(url: string): Promise<'copied'> {
  await navigator.clipboard.writeText(url)
  return 'copied'
}
