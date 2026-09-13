/** Auth-plugin reads get the same account and membership boundaries as custom APIs. */
import { APIError, getSessionFromCtx } from 'better-auth/api'
import { z } from 'zod'

import { ACCOUNT_ID_HEADER, accountIdSchema } from '../../shared/account-identity'

const PRIVATE_READ_PATHS = new Set([
  '/organization/get-organization',
  '/organization/get-full-organization',
  '/organization/list-members',
  '/organization/list-invitations',
  '/organization/get-active-member-role',
  '/organization/get-active-member',
])
const SIGNED_IN_PATHS = new Set([
  '/get-session',
  '/account-info',
  '/get-access-token',
  '/refresh-token',
  '/list-sessions',
  '/list-accounts',
  '/link-social',
  '/unlink-account',
  '/update-user',
  '/update-session',
  '/verify-password',
  '/change-password',
  '/set-password',
  '/change-email',
  '/revoke-session',
  '/revoke-sessions',
  '/revoke-other-sessions',
  '/sign-out',
  '/delete-user',
])
const activeWorkspaceSchema = z.object({ activeOrganizationId: z.nullish(accountIdSchema) })
const OWNER_MUTATION_PATHS = new Set([
  '/organization/invite-member',
  '/organization/add-member',
  '/organization/update-member-role',
  '/organization/remove-member',
  '/organization/cancel-invitation',
])
const ownerMutationSchema = z.object({
  organizationId: z.optional(accountIdSchema),
  memberId: z.optional(accountIdSchema),
  memberIdOrEmail: z.optional(z.string()),
  invitationId: z.optional(accountIdSchema),
})
const workspaceQuerySchema = z.object({
  organizationId: z.optional(accountIdSchema),
  organizationSlug: z.optional(accountIdSchema),
})

/** Do not reveal whether an inaccessible workspace exists, even by differing error codes. */
export async function enforceAuthPrivacy(
  ctx: Parameters<typeof getSessionFromCtx>[0],
): Promise<void> {
  const path = ctx.path.replace(/\/$/, '')
  const isPrivateRead = PRIVATE_READ_PATHS.has(path)
  const isOwnerMutation = OWNER_MUTATION_PATHS.has(path)
  const expected = ctx.headers?.get(ACCOUNT_ID_HEADER)
  const isAccountBound =
    path.startsWith('/organization/') || path.startsWith('/admin/') || SIGNED_IN_PATHS.has(path)
  if (!isPrivateRead && !isOwnerMutation && (!isAccountBound || expected == null)) return
  const session = await getSessionFromCtx(ctx)
  if (session === null) return
  if (expected != null) {
    const parsed = accountIdSchema.safeParse(expected)
    if (!parsed.success || parsed.data !== session.user.id) {
      throw new APIError('FORBIDDEN', {
        code: 'ACCOUNT_CHANGED',
        message: 'Sign in again before continuing.',
      })
    }
  }
  if (isOwnerMutation) {
    const input = ownerMutationSchema.safeParse(ctx.body)
    if (!input.success) throw denied()
    const active = activeWorkspaceSchema.parse(session.session)
    let organizationId = input.data.organizationId ?? active.activeOrganizationId
    if (input.data.invitationId !== undefined) {
      const invitation = await ctx.context.adapter.findOne<{ organizationId: string }>({
        model: 'invitation',
        where: [{ field: 'id', value: input.data.invitationId }],
      })
      if (invitation === null) throw denied()
      organizationId = invitation.organizationId
    }
    if (organizationId == null) throw denied()
    const actor = await ctx.context.adapter.findOne<{ role: string }>({
      model: 'member',
      where: [
        { field: 'organizationId', value: organizationId },
        { field: 'userId', value: session.user.id },
      ],
    })
    if (actor?.role !== 'owner') throw denied()
    const targetId = input.data.memberId ?? input.data.memberIdOrEmail
    if (targetId !== undefined) {
      const members = await ctx.context.adapter.findMany<{
        id: string
        userId: string
        role: string
      }>({
        model: 'member',
        where: [{ field: 'organizationId', value: organizationId }],
      })
      for (const member of members) {
        if (member.role !== 'owner') continue
        const owner = await ctx.context.adapter.findOne<{ email: string }>({
          model: 'user',
          where: [{ field: 'id', value: member.userId }],
        })
        if (member.id === targetId || owner?.email.toLowerCase() === targetId.toLowerCase())
          throw denied()
      }
    }
  }
  if (!isPrivateRead) return
  const query = workspaceQuerySchema.safeParse(ctx.query ?? {})
  if (!query.success) throw denied()
  const active = activeWorkspaceSchema.parse(session.session)
  let organizationId = query.data.organizationId ?? active.activeOrganizationId
  if (query.data.organizationSlug !== undefined) {
    const organization = await ctx.context.adapter.findOne<{ id: string }>({
      model: 'organization',
      where: [{ field: 'slug', value: query.data.organizationSlug }],
    })
    if (organization === null) throw denied()
    organizationId = organization.id
  }
  if (organizationId == null) return
  const membership = await ctx.context.adapter.findOne({
    model: 'member',
    where: [
      { field: 'organizationId', value: organizationId },
      { field: 'userId', value: session.user.id },
    ],
  })
  if (membership === null) throw denied()
}

function denied(): APIError {
  return new APIError('FORBIDDEN', {
    code: 'WORKSPACE_ACCESS_DENIED',
    message: 'You do not have access to this workspace.',
  })
}
