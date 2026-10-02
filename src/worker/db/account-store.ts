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

import {
  MEMBERSHIP_COHORT,
  privateInvitationBudgetSchema,
  SITE_INVITATION_POLICY,
} from '../../shared/api-accounts'
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
    EXISTS (SELECT 1 FROM user WHERE id = ${id} AND membership_cohort = ${MEMBERSHIP_COHORT.private} AND email_verified = 1 AND coalesce(banned, 0) = 0
        AND (${role} = ${SITE_ROLE.user} OR (EXISTS (SELECT 1 FROM site_owner) AND
          (role = ${SITE_ROLE.admin} OR (role = ${SITE_ROLE.owner} AND id = (SELECT user_id FROM site_owner WHERE id = 1))))))
  `

const invitationCapacityPredicate = (id: string) => sql`
  (SELECT COUNT(*) FROM site_invitation WHERE inviter_id = ${id}
    AND grant_version = ${SITE_INVITATION_POLICY.grantVersion}
    AND (accepted_at IS NOT NULL OR (revoked_at IS NULL AND expires_at > ${Date.now()})))
    < ${SITE_INVITATION_POLICY.newAdmissions}
`

const pendingReferrals = (inviterId: string) =>
  and(
    eq(siteInvitation.inviterId, inviterId),
    isNotNull(siteInvitation.referralId),
    isNull(siteInvitation.acceptedAt),
    isNull(siteInvitation.revokedAt),
  )

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
    async activateAccount(userId, cohort) {
      const activated = await db
        .update(user)
        .set({ membershipCohort: cohort })
        .where(and(eq(user.id, userId), eq(user.membershipCohort, MEMBERSHIP_COHORT.pending)))
        .returning({ id: user.id })
      if (activated.length === 0) throw new Error('Account admission was not activated')
    },
    async siteOwnerId() {
      const [owner] = await db.select({ userId: siteOwner.userId }).from(siteOwner)
      return owner?.userId ?? null
    },
    async invitationBudget(inviterId) {
      const [budget] = await db
        .select({
          used: sql<number>`COUNT(CASE WHEN accepted_at IS NOT NULL THEN 1 END)`.mapWith(Number),
          reserved:
            sql<number>`COUNT(CASE WHEN accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ${Date.now()} THEN 1 END)`.mapWith(
              Number,
            ),
        })
        .from(siteInvitation)
        .where(
          and(
            eq(siteInvitation.inviterId, inviterId),
            eq(siteInvitation.grantVersion, SITE_INVITATION_POLICY.grantVersion),
          ),
        )
      if (budget === undefined) throw new Error('Private invitation budget is unavailable')
      return privateInvitationBudgetSchema.parse({
        ...budget,
        limit: SITE_INVITATION_POLICY.newAdmissions,
        available: SITE_INVITATION_POLICY.newAdmissions - budget.used - budget.reserved,
      })
    },
    async createInvitation(record) {
      const rows = await db.all<{
        id: string
      }>(sql`
        INSERT INTO site_invitation (id, inviter_id, email, role, token_hash, created_at, expires_at)
                SELECT ${record.id}, ${record.inviterId}, ${record.email}, ${record.role}, ${record.tokenHash}, ${record.createdAt.getTime()}, ${record.expiresAt.getTime()}
                WHERE ${eligibleInviter(record.inviterId, record.role)} AND ${invitationCapacityPredicate(record.inviterId)} AND (SELECT COUNT(*) FROM site_invitation WHERE inviter_id = ${record.inviterId} AND referral_id IS NULL AND created_at > ${Date.now() - SITE_INVITATION_POLICY.sendWindowMs}) < ${SITE_INVITATION_POLICY.sendsPerWindow}
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
                WHERE ${eligibleInviter(link.userId)} AND ${invitationCapacityPredicate(link.userId)} AND EXISTS (SELECT 1 FROM referral_link WHERE id = ${link.id} AND token_hash = ${tokenHash} AND revoked_at IS NULL)
                  AND (SELECT COUNT(*) FROM site_invitation WHERE inviter_id = ${link.userId} AND referral_id IS NOT NULL AND created_at > ${now - SITE_INVITATION_POLICY.referralWindowMs}) < ${SITE_INVITATION_POLICY.referralsPerDay}
                ON CONFLICT(token_hash) DO UPDATE SET created_at = excluded.created_at, expires_at = excluded.expires_at, grant_version = excluded.grant_version
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
        .where(
          and(
            inArray(siteInvitation.tokenHash, hashes),
            eq(siteInvitation.email, normalizedEmail),
            eq(siteInvitation.acceptedUserId, userId),
            isNotNull(siteInvitation.acceptedAt),
          ),
        )
        .limit(1)
      const candidate = and(
        eq(user.id, userId),
        eq(user.email, normalizedEmail),
        eq(user.membershipCohort, MEMBERSHIP_COHORT.pending),
        sql`coalesce(${user.role}, ${SITE_ROLE.user}) = ${SITE_ROLE.user}`,
        exists(admission),
      )
      const consumption = and(
        match,
        sql`EXISTS (SELECT 1 FROM user WHERE id = ${userId} AND email = ${normalizedEmail} AND membership_cohort = ${MEMBERSHIP_COHORT.pending} AND coalesce(role, ${SITE_ROLE.user}) = ${SITE_ROLE.user} AND coalesce(banned, 0) = 0)`,
      )
      // The transaction consumes only for a still-pending account, then grants
      // its exact role/cohort from that consumption. Existing accounts cannot
      // spend a private grant or turn a failed reservation into public access.
      const results = await db.batch([
        db
          .update(siteInvitation)
          .set({ acceptedAt: new Date(), acceptedUserId: userId })
          .where(consumption)
          .returning({ id: siteInvitation.id }),
        db
          .update(user)
          .set({ role: sql`${admission}`, membershipCohort: MEMBERSHIP_COHORT.private })
          .where(candidate),
      ])
      return results[0].length > 0
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
        await db.batch([
          db
            .update(siteInvitation)
            .set({ revokedAt: new Date() })
            .where(pendingReferrals(record.userId)),
          insert.onConflictDoUpdate({
            target: referralLink.userId,
            set: {
              nonce: record.nonce,
              tokenHash: record.tokenHash,
              createdAt: record.createdAt,
              revokedAt: null,
            },
          }),
        ])
      else await insert.onConflictDoNothing()
      const [saved] = await db
        .select()
        .from(referralLink)
        .where(eq(referralLink.userId, record.userId))
      if (saved === undefined) throw new Error('Referral link was not persisted')
      return saved
    },
    async revokeReferralLink(userId) {
      const now = new Date()
      await db.batch([
        db.update(referralLink).set({ revokedAt: now }).where(eq(referralLink.userId, userId)),
        db.update(siteInvitation).set({ revokedAt: now }).where(pendingReferrals(userId)),
      ])
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
