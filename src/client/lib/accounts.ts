import { queryOptions } from '@tanstack/react-query'

import { fetchJson, sendNoContent } from './api'
import {
  accountStatsSchema,
  siteInvitationDtoSchema,
  siteInvitationListSchema,
} from '../../shared/api-accounts'

/** Private sent-invitation query keys always include the authenticated account. */
export function siteInvitationsQueryOptions(userId: string) {
  return queryOptions({
    queryKey: ['site-invitations', userId],
    queryFn: () => fetchJson('/api/me/invitations', siteInvitationListSchema),
  })
}

export const accountStatsQueryOptions = queryOptions({
  queryKey: ['admin', 'account-stats'],
  queryFn: () => fetchJson('/api/admin/account-stats', accountStatsSchema),
})

export async function inviteToSite(email: string) {
  return await fetchJson('/api/me/invitations', siteInvitationDtoSchema, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  })
}

export async function revokeSiteInvitation(id: string): Promise<void> {
  await sendNoContent(`/api/me/invitations/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
