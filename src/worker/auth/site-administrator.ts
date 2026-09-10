/** Site managers share administration; the immutable owner and private identities stay protected. */
import { APIError, getSessionFromCtx } from 'better-auth/api'
import { z } from 'zod'

import { assignableSiteRoleSchema, canManageSite, SITE_ROLE } from '../../shared/site-roles'
import type { AccountStore } from '../account-store'

const adminInputSchema = z.object({
  userId: z.string().optional(),
  role: z.unknown().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
})
const IDENTITY_FIELDS = ['id', 'email', 'emailVerified']
const READ_ONLY_ADMIN_PATHS = new Set([
  '/admin/get-user',
  '/admin/list-users',
  '/admin/has-permission',
])
const PRIVATE_SESSION_PATHS = new Set(['/admin/list-user-sessions', '/admin/revoke-user-session'])

/** A forged owner label never substitutes for the database's immutable anchor. */
export function hasSiteManagementAccess(
  user: { id: string; role?: unknown },
  ownerId: string | null,
): boolean {
  return (
    ownerId !== null &&
    canManageSite(user.role) &&
    (user.role !== SITE_ROLE.owner || user.id === ownerId)
  )
}

/** Rejects privilege changes at the API boundary before Better Auth can apply them. */
export async function enforceSiteAdministrator(
  ctx: Parameters<typeof getSessionFromCtx>[0],
  accounts: AccountStore,
): Promise<void> {
  const path = ctx.path.replace(/\/$/, '')
  if (!path.startsWith('/admin/')) return
  const session = await getSessionFromCtx(ctx)
  if (session === null) return
  const ownerId = await accounts.siteOwnerId()
  if (!hasSiteManagementAccess(session.user, ownerId)) throw denied()
  // Session tokens are bearer credentials, not administrative metadata. Managers
  // may revoke all sessions for a non-owner account without learning those tokens.
  if (PRIVATE_SESSION_PATHS.has(path)) throw denied()
  const input = adminInputSchema.safeParse(ctx.body ?? {})
  if (!input.success) throw denied()
  const { userId, role, data } = input.data
  if (userId === ownerId && !READ_ONLY_ADMIN_PATHS.has(path)) throw denied()
  const requestedRole = role ?? data?.['role']
  if (
    requestedRole !== undefined &&
    !READ_ONLY_ADMIN_PATHS.has(path) &&
    !assignableSiteRoleSchema.safeParse(requestedRole).success
  )
    throw denied()
  if (role !== undefined && data?.['role'] !== undefined && role !== data['role']) throw denied()
  if (
    path === '/admin/set-user-password' ||
    (path === '/admin/update-user' &&
      IDENTITY_FIELDS.some((field) => data !== undefined && Object.hasOwn(data, field)))
  ) {
    throw new APIError('FORBIDDEN', {
      code: 'ACCOUNT_IDENTITY_PROTECTED',
      message: 'Account identity and password recovery require the account owner.',
    })
  }
}

function denied(): APIError {
  return new APIError('FORBIDDEN', {
    code: 'SITE_MANAGEMENT_PROTECTED',
    message: 'This site-management action is not allowed.',
  })
}
