/** Account admission controls are separate from workspace membership. */
import { z } from 'zod'

import { emailSchema } from './validation'

export const SITE_INVITATION_POLICY = {
  referralsPerDay: 100,
  referralWindowMs: 86_400_000,
  expiresInMs: 604_800_000,
  sendWindowMs: 3_600_000,
  sendWindowSeconds: 3600,
  sendsPerWindow: 20,
  requestBytes: 2048,
  listLimit: 100,
} as const

export const siteInvitationRequestSchema = z.object({ email: emailSchema }).strict()
export const siteInvitationDtoSchema = z.object({
  id: z.string(),
  email: z.email(),
  status: z.enum(['pending', 'accepted', 'revoked', 'expired']),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
})
export const siteInvitationListSchema = z.object({ invitations: z.array(siteInvitationDtoSchema) })
export const privateWorkspaceSchema = z.object({ organizationId: z.string() })
export const accountStatsSchema = z.object({
  users: z.number().int().nonnegative(),
  verifiedUsers: z.number().int().nonnegative(),
  pendingInvitations: z.number().int().nonnegative(),
  acceptedInvitations: z.number().int().nonnegative(),
})
export type SiteInvitationDto = z.infer<typeof siteInvitationDtoSchema>
export type AccountStats = z.infer<typeof accountStatsSchema>

export const referralLinkSchema = z.object({
  url: z.url().nullable(),
  acceptedAccounts: z.number().int().nonnegative(),
})
