import { and, desc, eq, sql, type SQL, type SQLWrapper } from 'drizzle-orm'
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'

import type { Database } from './client'
import { member, organization, user, workspaceAccessLink } from './schema'
import {
  WORKSPACE_ACCESS_POLICY,
  workspaceAccessSchema,
  workspaceInvitationAcceptedSchema,
} from '../../shared/workspace-access'
import type { WorkspaceAccessStore } from '../workspace-access-store'

const eligibleUser = (userId: string | SQLWrapper) => sql`
  EXISTS (
    SELECT 1 FROM user AS eligible_account WHERE eligible_account.id = ${userId} AND eligible_account.email_verified = 1 AND coalesce(eligible_account.banned, 0) = 0
  )
`
const owner = (orgId: string | SQLWrapper, userId: string | SQLWrapper) => sql`
  EXISTS (
    SELECT 1 FROM member AS access_owner WHERE access_owner.organization_id = ${orgId} AND access_owner.user_id = ${userId} AND access_owner.role = 'owner'
  ) AND ${eligibleUser(userId)}
`
const validLink = (userId: string) => sql`
  revoked_at IS NULL AND expires_at > ${Date.now()}
  AND (email IS NULL OR email = (SELECT lower(email) FROM user WHERE id = ${userId}))
  AND (accepted_user_id IS NULL OR accepted_user_id = ${userId})
  AND ${eligibleUser(userId)}
  AND ${owner(sql`workspace_access_link.organization_id`, sql`workspace_access_link.created_by`)}
`

const sendBudgetPredicate = (userId: string) => sql`
  (
    SELECT count(*) FROM audit_log WHERE actor_user_id = ${userId}
      AND action = ${WORKSPACE_ACCESS_POLICY.invitationAuditAction}
      AND created_at > ${Date.now() - WORKSPACE_ACCESS_POLICY.sendWindowMs}
  ) < ${WORKSPACE_ACCESS_POLICY.sendsPerWindow}
`

/** The audit insert immediately follows its mutation in the same D1 transaction. */
function accessAudit(
  organizationId: string | SQLWrapper,
  actorId: string,
  action: string,
  targetId: string,
  condition: SQL = sql`changes() > 0`,
) {
  return sql`
    INSERT INTO audit_log (id, organization_id, actor_user_id, actor_name, action, target_type, target_id, created_at)
        SELECT ${crypto.randomUUID()}, ${organizationId}, ${actorId}, (SELECT name FROM user WHERE id = ${actorId}), ${action}, 'workspace_access', ${targetId}, ${Date.now()}
        WHERE ${condition} RETURNING id
  `
}

/** Permission predicates, the write, and its audit run together; no stale owner can commit a grant. */
export function createDrizzleWorkspaceAccessStore(db: Database): WorkspaceAccessStore {
  const dialect = new SQLiteSyncDialect()
  const prepare = (query: SQL) => {
    const compiled = dialect.sqlToQuery(query)
    return db.$client.prepare(compiled.sql).bind(...compiled.params)
  }
  const didMutate = async (
    query: SQL,
    organizationId: string,
    actorId: string,
    action: string,
    targetId: string,
  ) => {
    const [result] = await db.$client.batch([
      prepare(query),
      prepare(accessAudit(organizationId, actorId, action, targetId)),
    ])
    return (result?.results.length ?? 0) > 0
  }
  return {
    async read(organizationId, userId) {
      const [membership] = await db
        .select()
        .from(member)
        .where(
          and(
            eq(member.organizationId, organizationId),
            eq(member.userId, userId),
            eligibleUser(userId),
          ),
        )
      if (membership === undefined) return null
      const isOwner = membership.role === 'owner'
      const members = await db
        .select({
          id: member.id,
          userId: member.userId,
          name: user.name,
          email: user.email,
          role: member.role,
        })
        .from(member)
        .innerJoin(user, eq(member.userId, user.id))
        .where(eq(member.organizationId, organizationId))
      const links = isOwner
        ? await db
            .select()
            .from(workspaceAccessLink)
            .where(eq(workspaceAccessLink.organizationId, organizationId))
            .orderBy(desc(workspaceAccessLink.createdAt))
            .limit(WORKSPACE_ACCESS_POLICY.listLimit)
        : []
      return { isOwner, members: workspaceAccessSchema.shape.members.parse(members), links }
    },
    async isOwner(organizationId, userId) {
      const rows = await db.all(sql`SELECT 1 WHERE ${owner(organizationId, userId)}`)
      return rows.length > 0
    },
    async existingUser(email) {
      const [row] = await db
        .select({ id: user.id })
        .from(user)
        .where(and(sql`lower(${user.email}) = ${email}`, eligibleUser(user.id)))
      return row !== undefined
    },
    async add(organizationId, ownerId, email, role) {
      const memberId = crypto.randomUUID()
      return await didMutate(
        sql`
          INSERT INTO member (id, organization_id, user_id, role, created_at)
                  SELECT ${memberId}, ${organizationId}, id, ${role}, ${Date.now()} FROM user
                  WHERE lower(email) = ${email} AND ${eligibleUser(user.id)} AND ${owner(organizationId, ownerId)}
                  AND NOT EXISTS (SELECT 1 FROM member WHERE organization_id = ${organizationId} AND user_id = user.id)
                  RETURNING id
        `,
        organizationId,
        ownerId,
        'workspace_access.added',
        memberId,
      )
    },
    async change(organizationId, ownerId, memberId, role) {
      return await didMutate(
        sql`
          UPDATE member SET role = ${role} WHERE id = ${memberId}
                  AND organization_id = ${organizationId} AND role <> 'owner' AND ${owner(organizationId, ownerId)} RETURNING id
        `,
        organizationId,
        ownerId,
        'workspace_access.changed',
        memberId,
      )
    },
    async remove(organizationId, ownerId, memberId) {
      return await didMutate(
        sql`
          DELETE FROM member WHERE id = ${memberId}
                  AND organization_id = ${organizationId} AND role <> 'owner' AND ${owner(organizationId, ownerId)} RETURNING id
        `,
        organizationId,
        ownerId,
        'workspace_access.removed',
        memberId,
      )
    },
    async createLink(link) {
      const didCreate = await didMutate(
        sql`
          INSERT INTO workspace_access_link
                  (id, organization_id, created_by, token_hash, role, email, created_at, expires_at, site_invitation_id)
                  SELECT ${link.id}, ${link.organizationId}, ${link.createdBy}, ${link.tokenHash}, ${link.role}, ${link.email}, ${link.createdAt.getTime()}, ${link.expiresAt.getTime()}, ${link.siteInvitationId}
                  WHERE ${owner(link.organizationId, link.createdBy)}
                  AND (${link.email} IS NULL OR ${sendBudgetPredicate(link.createdBy)}) AND
                  (SELECT count(*) FROM workspace_access_link WHERE organization_id = ${link.organizationId}
                    AND revoked_at IS NULL AND expires_at > ${Date.now()}) < ${WORKSPACE_ACCESS_POLICY.activeLinkLimit}
                  RETURNING id
        `,
        link.organizationId,
        link.createdBy,
        link.email === null
          ? 'workspace_access.link_created'
          : WORKSPACE_ACCESS_POLICY.invitationAuditAction,
        link.id,
      )
      if (didCreate) return 'created'
      if (link.email !== null) {
        // Diagnostic only: the grant decision and charge already ran atomically.
        // Audit rows have no workspace FK and survive revocation and deletion.
        const limited = await db.all(
          sql`SELECT 1 WHERE NOT (${sendBudgetPredicate(link.createdBy)})`,
        )
        if (limited.length > 0) return 'rate-limited'
      }
      return 'denied'
    },
    async reserveInvitationEmail(organizationId, actorId, invitationId) {
      const rows = await db.all(
        accessAudit(
          organizationId,
          actorId,
          WORKSPACE_ACCESS_POLICY.invitationAuditAction,
          invitationId,
          sql`${owner(organizationId, actorId)} AND ${sendBudgetPredicate(actorId)}`,
        ),
      )
      return rows.length > 0
    },
    async revoke(organizationId, ownerId, linkId) {
      if (
        !(await didMutate(
          sql`
            UPDATE workspace_access_link SET revoked_at = ${Date.now()}
                    WHERE organization_id = ${organizationId} AND id = ${linkId} AND ${owner(organizationId, ownerId)} RETURNING id
          `,
          organizationId,
          ownerId,
          'workspace_access.link_revoked',
          linkId,
        ))
      )
        return null
      const [row] = await db
        .select()
        .from(workspaceAccessLink)
        .where(
          and(
            eq(workspaceAccessLink.organizationId, organizationId),
            eq(workspaceAccessLink.id, linkId),
          ),
        )
      return row ?? null
    },
    async preview(tokenHash, userId) {
      const [row] = await db
        .select({ link: workspaceAccessLink, workspaceName: organization.name })
        .from(workspaceAccessLink)
        .innerJoin(organization, eq(organization.id, workspaceAccessLink.organizationId))
        .where(and(eq(workspaceAccessLink.tokenHash, tokenHash), validLink(userId)))
      if (row === undefined) return null
      const [membership] = await db
        .select({ id: member.id })
        .from(member)
        .where(and(eq(member.organizationId, row.link.organizationId), eq(member.userId, userId)))
      return { ...row, isMember: membership !== undefined }
    },
    async accept(tokenHash, userId) {
      // The bearer grants entry, never rewrites a member's existing permissions.
      const results = await db.$client.batch([
        prepare(sql`
          INSERT INTO member (id, organization_id, user_id, role, created_at)
                    SELECT ${crypto.randomUUID()}, organization_id, ${userId}, role, ${Date.now()} FROM workspace_access_link
                    WHERE token_hash = ${tokenHash} AND ${validLink(userId)} AND NOT EXISTS
                    (SELECT 1 FROM member WHERE organization_id = workspace_access_link.organization_id AND user_id = ${userId})
        `),
        prepare(
          accessAudit(
            sql`(SELECT organization_id FROM workspace_access_link WHERE token_hash = ${tokenHash})`,
            userId,
            'workspace_access.accepted',
            userId,
          ),
        ),
        prepare(sql`
          UPDATE workspace_access_link SET accepted_user_id = CASE WHEN email IS NULL THEN NULL ELSE ${userId} END
                    WHERE token_hash = ${tokenHash} AND ${validLink(userId)} RETURNING organization_id AS organizationId
        `),
      ])
      const row = results[2]?.results[0]
      return row === undefined ? null : workspaceInvitationAcceptedSchema.parse(row).organizationId
    },
  }
}
