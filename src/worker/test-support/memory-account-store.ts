import { SITE_INVITATION_POLICY } from '../../shared/api-accounts'
import type { AccountStore, ReferralLinkRecord, SiteInvitationRecord } from '../account-store'
import { referralAdmissionHash } from '../referral'

interface AccountTables {
  user: { id?: string; role?: string | null; emailVerified?: boolean; banned?: boolean | null }[]
  organization: { id: string; name: string; slug: string; createdAt: Date }[]
  member: { id: string; organizationId: string; userId: string; role: string; createdAt: Date }[]
}

/** Real auth tables remain shared with Better Auth; only D1 persistence is replaced. */
export function createMemoryAccountStore(tables: AccountTables): AccountStore {
  const invitations = new Map<string, SiteInvitationRecord>()
  const referralLinks = new Map<string, ReferralLinkRecord>()
  const workspaces = new Map<string, string>()
  const owner = { id: null as string | null }
  const canInvite = (id: string) =>
    tables.user.some(
      (user) => user.id === id && user.emailVerified === true && user.banned !== true,
    )
  const isPending = (record: SiteInvitationRecord) =>
    record.acceptedAt === null &&
    record.revokedAt === null &&
    record.expiresAt.getTime() > Date.now() &&
    canInvite(record.inviterId)
  return {
    siteOwnerId() {
      owner.id ??= tables.user.find((user) => user.role === 'admin')?.id ?? null
      return Promise.resolve(owner.id)
    },
    createInvitation(record) {
      if (!canInvite(record.inviterId)) return Promise.resolve(false)
      const recent = invitations
        .values()
        .filter(
          (candidate) =>
            candidate.inviterId === record.inviterId &&
            candidate.referralId == null &&
            candidate.createdAt.getTime() > Date.now() - SITE_INVITATION_POLICY.sendWindowMs,
        )
        .toArray()
      if (recent.length >= SITE_INVITATION_POLICY.sendsPerWindow) return Promise.resolve(false)
      invitations.set(record.id, record)
      return Promise.resolve(true)
    },
    listInvitations(inviterId) {
      return Promise.resolve(
        invitations
          .values()
          .filter((record) => record.inviterId === inviterId && record.referralId == null)
          .toArray()
          .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, SITE_INVITATION_POLICY.listLimit),
      )
    },
    async pendingInvitation(tokenHash, email) {
      const normalizedEmail = email.toLowerCase()
      const direct = invitations
        .values()
        .find(
          (record) =>
            record.tokenHash === tokenHash &&
            record.email === normalizedEmail &&
            record.referralId == null &&
            isPending(record),
        )
      if (direct !== undefined) return direct
      const link = referralLinks
        .values()
        .find(
          (record) =>
            record.tokenHash === tokenHash && record.revokedAt === null && canInvite(record.userId),
        )
      if (link === undefined) return null
      const reservedHash = await referralAdmissionHash(tokenHash, normalizedEmail)
      const existing = invitations.values().find((record) => record.tokenHash === reservedHash)
      if (existing !== undefined && isPending(existing)) return existing
      if (existing !== undefined && (existing.acceptedAt !== null || existing.revokedAt !== null))
        return null
      const recent = invitations
        .values()
        .filter(
          (record) =>
            record.inviterId === link.userId &&
            record.referralId != null &&
            record.createdAt.getTime() > Date.now() - SITE_INVITATION_POLICY.referralWindowMs,
        )
        .toArray()
      if (recent.length >= SITE_INVITATION_POLICY.referralsPerDay) return null
      const record: SiteInvitationRecord = {
        id: existing?.id ?? crypto.randomUUID(),
        inviterId: link.userId,
        email: normalizedEmail,
        tokenHash: reservedHash,
        referralId: link.id,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + SITE_INVITATION_POLICY.expiresInMs),
        acceptedAt: null,
        acceptedUserId: null,
        revokedAt: null,
      }
      invitations.set(record.id, record)
      return record
    },
    async acceptInvitation(tokenHash, email, userId) {
      const hashes = new Set([tokenHash, await referralAdmissionHash(tokenHash, email)])
      const record = invitations
        .values()
        .find(
          (candidate) =>
            hashes.has(candidate.tokenHash) &&
            candidate.email === email.toLowerCase() &&
            isPending(candidate),
        )
      if (record !== undefined) {
        record.acceptedAt = new Date()
        record.acceptedUserId = userId
      }
      return
    },
    revokeInvitation(inviterId, id) {
      const record = invitations.get(id)
      if (record?.inviterId !== inviterId || !isPending(record)) return Promise.resolve(false)
      record.revokedAt = new Date()
      return Promise.resolve(true)
    },
    revokePendingAdmissions(inviterId) {
      for (const record of invitations.values())
        if (
          record.inviterId === inviterId &&
          record.acceptedAt === null &&
          record.revokedAt === null
        )
          record.revokedAt = new Date()
      const link = referralLinks.get(inviterId)
      if (link !== undefined) link.revokedAt = new Date()
      return Promise.resolve()
    },
    ensurePrivateWorkspace(userId) {
      const organizationId = `personal-${userId}`
      if (!workspaces.has(userId)) {
        tables.organization.push({
          id: organizationId,
          name: 'My workspace',
          slug: organizationId,
          createdAt: new Date(),
        })
        tables.member.push({
          id: organizationId,
          organizationId,
          userId,
          role: 'owner',
          createdAt: new Date(),
        })
        workspaces.set(userId, organizationId)
      }
      return Promise.resolve(organizationId)
    },
    isPrivateWorkspace(organizationId) {
      return Promise.resolve(workspaces.values().toArray().includes(organizationId))
    },
    findReferralLink(userId) {
      return Promise.resolve(referralLinks.get(userId) ?? null)
    },
    saveReferralLink(record, shouldReplace) {
      if (shouldReplace || !referralLinks.has(record.userId))
        referralLinks.set(record.userId, record)
      const saved = referralLinks.get(record.userId)
      if (saved === undefined) throw new Error('Referral link not saved')
      return Promise.resolve(saved)
    },
    revokeReferralLink(userId) {
      const record = referralLinks.get(userId)
      if (record !== undefined) record.revokedAt = new Date()
      return Promise.resolve()
    },
    referralAcceptedAccounts(userId) {
      return Promise.resolve(
        invitations
          .values()
          .filter(
            (record) =>
              record.inviterId === userId &&
              record.referralId != null &&
              record.acceptedAt !== null,
          )
          .toArray().length,
      )
    },
    statistics() {
      return Promise.resolve({
        users: tables.user.length,
        verifiedUsers: tables.user.filter((record) => record.emailVerified === true).length,
        pendingInvitations: invitations
          .values()
          .filter((record) => isPending(record))
          .toArray().length,
        acceptedInvitations: invitations
          .values()
          .filter((record) => record.acceptedAt !== null)
          .toArray().length,
      })
    },
  }
}
