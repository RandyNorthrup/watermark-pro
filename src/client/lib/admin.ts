/**
 * Platform administration data: Better Auth's admin plugin for users, and
 * the Worker's admin routes for organizations and the global audit trail.
 */
import { queryOptions } from '@tanstack/react-query'
import { z } from 'zod'

import { ApiRequestError, fetchJson } from './api'
import { authClient } from './auth-client'
import { adminOrganizationListSchema, auditListResponseSchema } from '../../shared/api'

export const PLATFORM_ADMIN_ROLE = 'admin'
export const ADMIN_USER_PAGE_SIZE = 50

export const adminUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  role: z.string().nullish(),
  banned: z.boolean().nullish(),
  banReason: z.string().nullish(),
  createdAt: z.coerce.date(),
})

export type AdminUser = z.infer<typeof adminUserSchema>

const userListSchema = z.object({ users: z.array(adminUserSchema), total: z.number() })

export function isPlatformAdmin(user: { role?: string | null | undefined }): boolean {
  return user.role === PLATFORM_ADMIN_ROLE
}

export const ADMIN_QUERY_KEY = ['admin'] as const

interface AdminResult<T> {
  data: T | null
  error: { message?: string | undefined; status?: number | undefined } | null
}

/** Better Auth client calls return `{ data, error }`; turn `error` into the app's request error. */
function unwrap<T>(path: string, result: AdminResult<T>): T | null {
  if (result.error !== null) {
    throw new ApiRequestError(path, result.error.status ?? 0, result.error.message)
  }
  return result.data
}

export function adminUsersQueryOptions(search: string) {
  return queryOptions({
    queryKey: [...ADMIN_QUERY_KEY, 'users', search],
    queryFn: async () => {
      const data = unwrap(
        '/api/auth/admin/list-users',
        await authClient.admin.listUsers({
          query: {
            limit: ADMIN_USER_PAGE_SIZE,
            sortBy: 'createdAt',
            sortDirection: 'desc',
            ...(search !== '' && {
              searchValue: search,
              searchField: 'email',
              searchOperator: 'contains',
            }),
          },
        }),
      )
      return userListSchema.parse(data)
    },
  })
}

export const adminOrganizationsQueryOptions = queryOptions({
  queryKey: [...ADMIN_QUERY_KEY, 'organizations'],
  queryFn: async () => {
    const response = await fetchJson('/api/admin/organizations', adminOrganizationListSchema)
    return response.organizations
  },
})

export const adminAuditQueryOptions = queryOptions({
  queryKey: [...ADMIN_QUERY_KEY, 'audit'],
  queryFn: async () => {
    const response = await fetchJson('/api/admin/audit', auditListResponseSchema)
    return response.entries
  },
})

export async function banUser(userId: string, reason: string): Promise<void> {
  unwrap('/api/auth/admin/ban-user', await authClient.admin.banUser({ userId, banReason: reason }))
}

export async function unbanUser(userId: string): Promise<void> {
  unwrap('/api/auth/admin/unban-user', await authClient.admin.unbanUser({ userId }))
}

export async function setUserRole(userId: string, role: 'admin' | 'user'): Promise<void> {
  unwrap('/api/auth/admin/set-role', await authClient.admin.setRole({ userId, role }))
}

export async function revokeUserSessions(userId: string): Promise<void> {
  unwrap(
    '/api/auth/admin/revoke-user-sessions',
    await authClient.admin.revokeUserSessions({ userId }),
  )
}
