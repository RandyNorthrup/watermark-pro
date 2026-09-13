/** Explicit workspace grants are separate from site admission and site administration. */
import { z } from 'zod'

import { accountIdSchema } from './account-identity'
import { SITE_INVITATION_POLICY } from './api-accounts'
import { EMAIL_MAX_LENGTH, SHARE_EXPIRY_DAYS } from './constants'

export const WORKSPACE_ACCESS_POLICY = {
  requestBytes: 4096,
  linkDays: SHARE_EXPIRY_DAYS,
  defaultLinkDays: 7,
  millisecondsPerDay: 86_400_000,
  activeLinkLimit: 50,
  listLimit: 100,
  sendsPerWindow: SITE_INVITATION_POLICY.sendsPerWindow,
  sendWindowMs: SITE_INVITATION_POLICY.sendWindowMs,
  sendWindowSeconds: SITE_INVITATION_POLICY.sendWindowSeconds,
  invitationAuditAction: 'workspace_access.invited',
} as const

export const workspaceGrantRoleSchema = z.enum(['viewer', 'editor'])
export type WorkspaceGrantRole = z.infer<typeof workspaceGrantRoleSchema>
export const workspaceGrantRequestSchema = z.object({
  email: z
    .email()
    .max(EMAIL_MAX_LENGTH)
    .transform((value) => value.toLowerCase()),
  role: workspaceGrantRoleSchema,
  notify: z.boolean(),
})
export const workspaceRoleRequestSchema = z.object({ role: workspaceGrantRoleSchema })
export const workspaceLinkRequestSchema = z.object({
  role: workspaceGrantRoleSchema,
  days: z.union(SHARE_EXPIRY_DAYS.map((days) => z.literal(days))),
})
export const workspaceLinkTokenSchema = z.string().regex(/^[a-f0-9-]{72}$/)
export const workspaceLinkDtoSchema = z.object({
  id: accountIdSchema,
  role: workspaceGrantRoleSchema,
  email: z.email().nullable(),
  expiresAt: z.iso.datetime(),
  status: z.enum(['pending', 'accepted', 'revoked', 'expired']),
})
export type WorkspaceLinkDto = z.infer<typeof workspaceLinkDtoSchema>
const workspaceAccessMemberSchema = z.object({
  id: accountIdSchema,
  userId: accountIdSchema,
  name: z.string(),
  email: z.email(),
  role: z.enum(['owner', 'admin', 'viewer', 'editor']),
})
export const workspaceAccessSchema = z.object({
  isOwner: z.boolean(),
  members: z.array(workspaceAccessMemberSchema),
  links: z.array(workspaceLinkDtoSchema),
})
export type WorkspaceAccessData = z.infer<typeof workspaceAccessSchema>
export const workspaceLinkCreatedSchema = z.object({ link: workspaceLinkDtoSchema, url: z.url() })
export const workspaceInvitationPreviewSchema = z.object({
  workspaceName: z.string(),
  role: workspaceGrantRoleSchema,
  isMember: z.boolean(),
})
export const workspaceInvitationAcceptedSchema = z.object({ organizationId: accountIdSchema })
