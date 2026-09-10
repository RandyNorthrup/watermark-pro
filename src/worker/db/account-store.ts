import {
  and,
  count,
  desc,
  eq,
  exists,
  gt,
  isNull,
  isNotNull,
  inArray,
  sql,
  type SQLWrapper,
} from 'drizzle-orm'

import { SITE_INVITATION_POLICY } from '../../shared/api-accounts'
import { SITE_ROLE } from '../../shared/site-roles'
import type { AccountStore } from '../account-store'
import { referralAdmissionHash } from '../referral'
import type { Database } from './client'
import {
  member,
  organization,
  privateWorkspace,
  referralLink,
  siteInvitation,
  siteOwner,
  user,
} from './schema'

const eligibleInviter = (id: SQLWrapper | string, role: SQLWrapper | string = SITE_ROLE.user) =>
  sql`
    EXISTS (SELECT 1 FROM user WHERE id = ${id} AND email_verified = 1 AND coalesce(banned, 0) = 0
        AND (${role} = ${SITE_ROLE.user} OR (EXISTS (SELECT 1 FROM site_owner) AND
          (role = ${SITE_ROLE.admin} OR (role = ${SITE_ROLE.owner} AND id = (SELECT user_id FROM site_owner WHERE id = 1))))))
  `

const pending = () =>
  and(
    isNull(siteInvitation.acceptedAt),
    isNull(siteInvitation.revokedAt),
    gt(siteInvitation.expiresAt, new Date()),
    eligibleInviter(siteInvitation.inviterId, siteInvitation.role),
  )

/** D1 admission storage. Personal workspace provisioning is one atomic, repeatable batch. */
export function createDrizzleAccountStore(db: Database): AccountStore {
  async function findPending(tokenHash: string, email: string, referralId?: string) {
    const [record] = await db
      .select()
      .from(siteInvitation)
      .where(
        and(
          eq(siteInvitation.tokenHash, tokenHash),
          eq(siteInvitation.email, email),
          referralId === undefined
            ? isNull(siteInvitation.referralId)
            : eq(siteInvitation.referralId, referralId),
          pending(),
        ),
      )
    return record ?? null
  }
  return {
    async siteOwnerId() {
      const [owner] = await db.select({ userId: siteOwner.userId }).from(siteOwner)
      return owner?.userId ?? null
    },
    async createInvitation(record) {
      const rows = await db.all<{
        id: string
      }>(sql`
        INSERT INTO site_invitation (id, inviter_id, email, role, token_hash, created_at, expires_at)
                SELECT ${record.id}, ${record.inviterId}, ${record.email}, ${record.role}, ${record.tokenHash}, ${record.createdAt.getTime()}, ${record.expiresAt.getTime()}
                WHERE ${eligibleInviter(record.inviterId, record.role)} AND (SELECT COUNT(*) FROM site_invitation WHERE inviter_id = ${record.inviterId} AND referral_id IS NULL AND created_at > ${Date.now() - SITE_INVITATION_POLICY.sendWindowMs}) < ${SITE_INVITATION_POLICY.sendsPerWindow}
                RETURNING id
      `)
      return rows.length > 0
    },
    async listInvitations(inviterId) {
      return await db
        .select()
        .from(siteInvitation)
        .where(and(eq(siteInvitation.inviterId, inviterId), isNull(siteInvitation.referralId)))
        .orderBy(desc(siteInvitation.createdAt))
        .limit(SITE_INVITATION_POLICY.listLimit)
    },
    async pendingInvitation(tokenHash, email) {
      const normalizedEmail = email.toLowerCase()
      const direct = await findPending(tokenHash, normalizedEmail)
      if (direct !== null) return direct
      const [link] = await db
        .select()
        .from(referralLink)
        .where(
          and(
            eq(referralLink.tokenHash, tokenHash),
            isNull(referralLink.revokedAt),
            eligibleInviter(referralLink.userId),
          ),
        )
      if (link === undefined) return null
      const reservedHash = await referralAdmissionHash(tokenHash, normalizedEmail)
      const existing = await findPending(reservedHash, normalizedEmail, link.id)
      if (existing !== null) return existing
      const now = Date.now()
      await db.run(sql`
        INSERT INTO site_invitation (id, inviter_id, email, token_hash, referral_id, created_at, expires_at)
                SELECT ${crypto.randomUUID()}, ${link.userId}, ${normalizedEmail}, ${reservedHash}, ${link.id}, ${now}, ${now + SITE_INVITATION_POLICY.expiresInMs}
                WHERE ${eligibleInviter(link.userId)} AND EXISTS (SELECT 1 FROM referral_link WHERE id = ${link.id} AND token_hash = ${tokenHash} AND revoked_at IS NULL)
                  AND (SELECT COUNT(*) FROM site_invitation WHERE inviter_id = ${link.userId} AND referral_id IS NOT NULL AND created_at > ${now - SITE_INVITATION_POLICY.referralWindowMs}) < ${SITE_INVITATION_POLICY.referralsPerDay}
                ON CONFLICT(token_hash) DO UPDATE SET created_at = excluded.created_at, expires_at = excluded.expires_at
                WHERE site_invitation.accepted_at IS NULL AND site_invitation.revoked_at IS NULL AND site_invitation.expires_at <= ${now}
      `)
      return await findPending(reservedHash, normalizedEmail, link.id)
    },
    async acceptInvitation(tokenHash, email, userId) {
      const normalizedEmail = email.toLowerCase()
      const hashes = [tokenHash, await referralAdmissionHash(tokenHash, normalizedEmail)]
      const match = and(
        inArray(siteInvitation.tokenHash, hashes),
        eq(siteInvitation.email, normalizedEmail),
        pending(),
      )
      const admission = db
        .select({ role: siteInvitation.role })
        .from(siteInvitation)
        .where(match)
        .limit(1)
      const candidate = and(
        eq(user.id, userId),
        eq(user.email, normalizedEmail),
        sql`coalesce(${user.role}, ${SITE_ROLE.user}) = ${SITE_ROLE.user}`,
        exists(admission),
      )
      const consumption = and(
        match,
        sql`EXISTS (SELECT 1 FROM user WHERE id = ${userId} AND email = ${normalizedEmail} AND role = ${siteInvitation.role})`,
      )
      // D1 batches are transactional: the role is granted only while the same
      // unconsumed invitation remains authorized, then consumed in that batch.
      await db.batch([
        db
          .update(user)
          .set({ role: sql`${admission}` })
          .where(candidate),
        db
          .update(siteInvitation)
          .set({ acceptedAt: new Date(), acceptedUserId: userId })
          .where(consumption),
      ])
    },
    async revokeInvitation(inviterId, id) {
      const result = await db
        .update(siteInvitation)
        .set({ revokedAt: new Date() })
        .where(and(eq(siteInvitation.id, id), eq(siteInvitation.inviterId, inviterId), pending()))
        .returning({ id: siteInvitation.id })
      return result.length > 0
    },
    async revokePendingAdmissions(inviterId) {
      const now = new Date()
      const unaccepted = and(
        eq(siteInvitation.inviterId, inviterId),
        isNull(siteInvitation.acceptedAt),
        isNull(siteInvitation.revokedAt),
      )
      await db.batch([
        db.update(siteInvitation).set({ revokedAt: now }).where(unaccepted),
        db.update(referralLink).set({ revokedAt: now }).where(eq(referralLink.userId, inviterId)),
      ])
    },
    async revokePendingAdministratorAdmissions(inviterId) {
      await db
        .update(siteInvitation)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(siteInvitation.inviterId, inviterId),
            eq(siteInvitation.role, SITE_ROLE.admin),
            isNull(siteInvitation.acceptedAt),
            isNull(siteInvitation.revokedAt),
          ),
        )
    },
    async ensurePrivateWorkspace(userId) {
      const organizationId = `personal-${userId}`
      await db.batch([
        db
          .insert(organization)
          .values({
            id: organizationId,
            name: 'My workspace',
            slug: organizationId,
            createdAt: new Date(),
          })
          .onConflictDoNothing(),
        db
          .insert(member)
          .values({
            id: organizationId,
            organizationId,
            userId,
            role: 'owner',
            createdAt: new Date(),
          })
          .onConflictDoNothing(),
        db.insert(privateWorkspace).values({ userId, organizationId }).onConflictDoNothing(),
      ])
      return organizationId
    },
    async isPrivateWorkspace(organizationId) {
      const [record] = await db
        .select({ userId: privateWorkspace.userId })
        .from(privateWorkspace)
        .where(eq(privateWorkspace.organizationId, organizationId))
      return record !== undefined
    },
    async findReferralLink(userId) {
      const [record] = await db.select().from(referralLink).where(eq(referralLink.userId, userId))
      return record ?? null
    },
    async saveReferralLink(record, shouldReplace) {
      const insert = db.insert(referralLink).values(record)
      if (shouldReplace)
        await insert.onConflictDoUpdate({
          target: referralLink.userId,
          set: {
            nonce: record.nonce,
            tokenHash: record.tokenHash,
            createdAt: record.createdAt,
            revokedAt: null,
          },
        })
      else await insert.onConflictDoNothing()
      const [saved] = await db
        .select()
        .from(referralLink)
        .where(eq(referralLink.userId, record.userId))
      if (saved === undefined) throw new Error('Referral link was not persisted')
      return saved
    },
    async revokeReferralLink(userId) {
      await db
        .update(referralLink)
        .set({ revokedAt: new Date() })
        .where(eq(referralLink.userId, userId))
    },
    async referralAcceptedAccounts(userId) {
      const [result] = await db
        .select({ total: count() })
        .from(siteInvitation)
        .where(
          and(
            eq(siteInvitation.inviterId, userId),
            isNotNull(siteInvitation.referralId),
            isNotNull(siteInvitation.acceptedAt),
          ),
        )
      if (result === undefined) throw new Error('Referral counts unavailable')
      return result.total
    },
    async statistics() {
      const [[users], [verified], [pendingInvites], [accepted]] = await db.batch([
        db.select({ total: count() }).from(user),
        db.select({ total: count() }).from(user).where(eq(user.emailVerified, true)),
        db.select({ total: count() }).from(siteInvitation).where(pending()),
        db
          .select({ total: count() })
          .from(siteInvitation)
          .where(isNotNull(siteInvitation.acceptedAt)),
      ])
      if (
        users === undefined ||
        verified === undefined ||
        pendingInvites === undefined ||
        accepted === undefined
      ) {
        throw new Error('Account statistics are unavailable')
      }
      return {
        users: users.total,
        verifiedUsers: verified.total,
        pendingInvitations: pendingInvites.total,
        acceptedInvitations: accepted.total,
      }
    },
  }
}
