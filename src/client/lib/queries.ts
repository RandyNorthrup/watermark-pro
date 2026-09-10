import { type QueryClient, queryOptions } from '@tanstack/react-query'

import { ApiRequestError, fetchJson, isTransportFailure } from './api'
import { authClient } from './auth-client'
import { captureOfflineGeneration, captureOfflineOwner } from './offline-context'
import { auditListResponseSchema, publicConfigSchema } from '../../shared/api'
import type { BootstrapSnapshot } from '../../shared/bootstrap'
import { HTTP_STATUS } from '../../shared/constants'
import {
  shellOrganizationSchema,
  shellOrganizationsSchema,
  shellRoleSchema,
  shellSessionSchema,
} from '../../shared/shell-cache'

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
  queryFn: async () => {
    const generation = captureOfflineGeneration()
    try {
      const result = await authClient.getSession()
      generation.assertCurrent()
      const response = unwrap('/api/auth/get-session', result)
      return response === null ? null : shellSessionSchema.parse(response)
    } catch (error) {
      generation.assertCurrent()
      throw error
    }
  },
})

export const organizationsQueryOptions = queryOptions({
  queryKey: ['organizations'],
  queryFn: async () =>
    shellOrganizationsSchema.parse(
      unwrap('/api/auth/organization/list', await authClient.organization.list()) ?? [],
    ),
})

export const activeOrganizationQueryOptions = queryOptions({
  queryKey: ['organization', 'active'],
  queryFn: async () => {
    const result = unwrap(
      '/api/auth/organization/get-full-organization',
      await authClient.organization.getFullOrganization(),
    )
    return result === null ? null : shellOrganizationSchema.parse(result)
  },
})

export const activeMemberRoleQueryOptions = queryOptions({
  queryKey: ['organization', 'active', 'role'],
  queryFn: async () => {
    const result = unwrap(
      '/api/auth/organization/get-active-member-role',
      await authClient.organization.getActiveMemberRole(),
    )
    return result === null ? null : shellRoleSchema.parse(result)
  },
})

/** Seed the existing shell query keys only after the snapshot's account has been admitted. */
export function seedBootstrapQueries(queryClient: QueryClient, snapshot: BootstrapSnapshot): void {
  const owner = captureOfflineOwner()
  if (snapshot.session.user.id !== owner.userId)
    throw new Error('The signed-in account changed before loading its workspace.')
  owner.assertCurrent()
  queryClient.setQueryData(sessionQueryOptions.queryKey, snapshot.session)
  queryClient.setQueryData(organizationsQueryOptions.queryKey, snapshot.organizations)
  queryClient.setQueryData(activeOrganizationQueryOptions.queryKey, snapshot.organization)
  queryClient.setQueryData(activeMemberRoleQueryOptions.queryKey, snapshot.role)
}

/** Offline tools use the last displayed role; the server rechecks authorization for every replay. */
export async function readActiveMemberRole(queryClient: QueryClient) {
  const owner = captureOfflineOwner()
  const session = queryClient.getQueryData(sessionQueryOptions.queryKey)
  const cached = queryClient.getQueryData(activeMemberRoleQueryOptions.queryKey)
  function offlineRole() {
    owner.assertCurrent()
    if (cached === undefined || session?.user.id !== owner.userId) {
      throw new Error('Connect once before using this workspace offline.')
    }
    return cached
  }
  if (!navigator.onLine) return offlineRole()
  try {
    const role = await queryClient.query({ ...activeMemberRoleQueryOptions, retry: false })
    owner.assertCurrent()
    return role
  } catch (error) {
    if (!isTransportFailure(error)) {
      if (
        error instanceof ApiRequestError &&
        (error.status === HTTP_STATUS.unauthorized || error.status === HTTP_STATUS.forbidden)
      )
        queryClient.removeQueries({ queryKey: activeMemberRoleQueryOptions.queryKey })
      throw error
    }
    return offlineRole()
  }
}

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
