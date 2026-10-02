/** Account admission controls are separate from workspace membership. */
import { z } from 'zod'

import { assignableSiteRoleSchema, SITE_ROLE } from './site-roles'
import { emailSchema } from './validation'

export const SITE_INVITATION_POLICY = {
  newAdmissions: 2,
  grantVersion: 1,
  referralsPerDay: 100,
  referralWindowMs: 86_400_000,
  expiresInMs: 604_800_000,
  sendWindowMs: 3_600_000,
  sendWindowSeconds: 3600,
  sendsPerWindow: 20,
  requestBytes: 2048,
  listLimit: 100,
} as const

/** Membership is server-owned and independent of payment, site roles and workspace roles. */
export const MEMBERSHIP_COHORT = {
  pending: 'pending',
  public: 'public',
  private: 'private',
} as const
export const membershipCohortSchema = z.enum([
  MEMBERSHIP_COHORT.pending,
  MEMBERSHIP_COHORT.public,
  MEMBERSHIP_COHORT.private,
])
export type MembershipCohort = z.infer<typeof membershipCohortSchema>

export const privateInvitationBudgetSchema = z.object({
  limit: z.literal(SITE_INVITATION_POLICY.newAdmissions),
  used: z.number().int().nonnegative().max(SITE_INVITATION_POLICY.newAdmissions),
  reserved: z.number().int().nonnegative().max(SITE_INVITATION_POLICY.newAdmissions),
  available: z.number().int().nonnegative().max(SITE_INVITATION_POLICY.newAdmissions),
})
export type PrivateInvitationBudget = z.infer<typeof privateInvitationBudgetSchema>

export const siteInvitationRequestSchema = z
  .object({ email: emailSchema, role: assignableSiteRoleSchema.default(SITE_ROLE.user) })
  .strict()
export const siteInvitationDtoSchema = z.object({
  id: z.string(),
  email: z.email(),
  role: assignableSiteRoleSchema,
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
/** Validated admission request with an explicit default User role. */
export type SiteInvitationRequest = z.infer<typeof siteInvitationRequestSchema>
export type AccountStats = z.infer<typeof accountStatsSchema>

export const referralLinkSchema = z.object({
  url: z.url().nullable(),
  acceptedAccounts: z.number().int().nonnegative(),
})
