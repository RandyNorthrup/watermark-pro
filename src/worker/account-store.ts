import type { AccountStats } from '../shared/api-accounts'
import type { AssignableSiteRole } from '../shared/site-roles'

export interface SiteInvitationRecord {
  id: string
  inviterId: string
  email: string
  role: AssignableSiteRole
  tokenHash: string
  referralId?: string | null | undefined
  createdAt: Date
  expiresAt: Date
  acceptedAt: Date | null
  acceptedUserId: string | null
  revokedAt: Date | null
}

/** No method returns another user's private workspace or sent invitations. */
export interface AccountStore {
  siteOwnerId(): Promise<string | null>
  createInvitation(record: SiteInvitationRecord): Promise<boolean>
  listInvitations(inviterId: string): Promise<SiteInvitationRecord[]>
  pendingInvitation(tokenHash: string, email: string): Promise<SiteInvitationRecord | null>
  acceptInvitation(tokenHash: string, email: string, userId: string): Promise<void>
  revokeInvitation(inviterId: string, id: string): Promise<boolean>
  revokePendingAdmissions(inviterId: string): Promise<void>
  revokePendingAdministratorAdmissions(inviterId: string): Promise<void>
  ensurePrivateWorkspace(userId: string): Promise<string>
  isPrivateWorkspace(organizationId: string): Promise<boolean>
  findReferralLink(userId: string): Promise<ReferralLinkRecord | null>
  saveReferralLink(record: ReferralLinkRecord, shouldReplace: boolean): Promise<ReferralLinkRecord>
  revokeReferralLink(userId: string): Promise<void>
  referralAcceptedAccounts(userId: string): Promise<number>
  statistics(): Promise<AccountStats>
}

export interface ReferralLinkRecord {
  id: string
  userId: string
  nonce: string
  tokenHash: string
  createdAt: Date
  revokedAt: Date | null
}
