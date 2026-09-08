import { type QueryClient, queryOptions } from '@tanstack/react-query'

import { ApiRequestError, fetchJson } from './api'
import { authClient } from './auth-client'
import { auditListResponseSchema, publicConfigSchema } from '../../shared/api'

/**
 * Query definitions shared by route loaders and components. Better Auth
 * client calls return `{ data, error }`; the helpers below turn `error` into
 * a thrown `ApiRequestError` so TanStack Query and the router error boundaries
 * see one failure shape.
 */

interface AuthResult<T> {
  data: T | null
  error: { status?: number | undefined; message?: string | undefined } | null
}

function unwrap<T>(path: string, result: AuthResult<T>): T | null {
  if (result.error !== null) {
    throw new ApiRequestError(path, result.error.status ?? 0, result.error.message)
  }
  return result.data
}

export const sessionQueryOptions = queryOptions({
  queryKey: ['session'],
  queryFn: async () => unwrap('/api/auth/get-session', await authClient.getSession()),
})

export const organizationsQueryOptions = queryOptions({
  queryKey: ['organizations'],
  queryFn: async () =>
    unwrap('/api/auth/organization/list', await authClient.organization.list()) ?? [],
})

export const activeOrganizationQueryOptions = queryOptions({
  queryKey: ['organization', 'active'],
  queryFn: async () =>
    unwrap(
      '/api/auth/organization/get-full-organization',
      await authClient.organization.getFullOrganization(),
    ),
})

export const activeMemberRoleQueryOptions = queryOptions({
  queryKey: ['organization', 'active', 'role'],
  queryFn: async () =>
    unwrap(
      '/api/auth/organization/get-active-member-role',
      await authClient.organization.getActiveMemberRole(),
    ),
})

export function auditQueryOptions(organizationId: string) {
  return queryOptions({
    queryKey: ['organization', organizationId, 'audit'],
    queryFn: () => fetchJson(`/api/orgs/${organizationId}/audit`, auditListResponseSchema),
  })
}

/** Query keys to drop after anything that changes membership or the active organization. */
export const ORGANIZATION_QUERY_KEY = ['organization'] as const

/**
 * Drops the shell queries the authenticated layout's `beforeLoad` decides from —
 * the session, the organization list and the active organization — so that after
 * a mutation that changes them (creating or joining an organization, signing in,
 * switching the active one) the next boot re-fetches them fresh instead of
 * reading a stale value from the cache-first path (PLAN §2). Removing (rather
 * than refetching) is what makes onboarding correct: the active-organization
 * query is often not in the cache yet, and a `getSession` right after `setActive`
 * can lag, so the reliable rule is "after a shell mutation, boot fetches fresh".
 * Ordinary navigation between `/app` pages keeps its cache and stays fast.
 */
export function resetShellQueries(queryClient: QueryClient): void {
  queryClient.removeQueries({ queryKey: sessionQueryOptions.queryKey })
  queryClient.removeQueries({ queryKey: organizationsQueryOptions.queryKey })
  queryClient.removeQueries({ queryKey: activeOrganizationQueryOptions.queryKey })
}

/** Turnstile site key and other pre-sign-in settings; static for the life of a deployment. */
export const publicConfigQueryOptions = queryOptions({
  queryKey: ['public-config'],
  queryFn: () => fetchJson('/api/config', publicConfigSchema),
  staleTime: Infinity,
})
