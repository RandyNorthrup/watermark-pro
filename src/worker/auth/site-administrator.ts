/** Site administration belongs to one anchored account; workspace roles do not grant it. */
import { APIError, getSessionFromCtx } from 'better-auth/api'
import { z } from 'zod'

import type { AccountStore } from '../account-store'

const adminInputSchema = z.object({
  userId: z.string().optional(),
  role: z.unknown().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
})
const roleSchema = z.union([z.string(), z.array(z.string())])
const IDENTITY_FIELDS = ['id', 'email', 'emailVerified']

function hasAdminRole(value: unknown): boolean {
  const parsed = roleSchema.safeParse(value)
  if (!parsed.success) return false
  const roles = typeof parsed.data === 'string' ? [parsed.data] : parsed.data
  return roles.some((role) => role.split(',').some((part) => part.trim() === 'admin'))
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
  if (session.user.id !== ownerId) throw denied()
  const input = adminInputSchema.safeParse(ctx.body ?? {})
  if (!input.success) throw denied()
  const { userId, role, data } = input.data
  const requestedRole = role ?? data?.['role']
  if (path === '/admin/create-user' && hasAdminRole(requestedRole)) throw denied()
  if (
    requestedRole !== undefined &&
    (path === '/admin/set-role' || path === '/admin/update-user') &&
    ((userId === ownerId && requestedRole !== 'admin') ||
      (userId !== ownerId && hasAdminRole(requestedRole)))
  )
    throw denied()
  if (
    userId === ownerId &&
    (path === '/admin/ban-user' || path === '/admin/remove-user' || data?.['banned'] === true)
  )
    throw denied()
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
    code: 'SINGLE_SITE_ADMIN',
    message:
      'Only the existing site administrator has this authority. Additional administrators are disabled.',
  })
}
