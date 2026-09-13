import { WORKSPACE_ACCESS_POLICY, workspaceAccessSchema } from '../../shared/workspace-access'
import type { AuditRecord } from '../audit'
import type { WorkspaceAccessLink, WorkspaceAccessStore } from '../workspace-access-store'

interface AccessTables {
  user: {
    id?: string
    name?: string
    email?: string
    emailVerified?: boolean
    banned?: boolean | null
  }[]
  organization: { id: string; name: string }[]
  member: { id: string; organizationId: string; userId: string; role: string; createdAt: Date }[]
}

/** Mutates the same tables used by real Better Auth sessions in the Node harness. */
export function createMemoryWorkspaceAccessStore(
  tables: AccessTables,
  audit: { records: AuditRecord[] },
): WorkspaceAccessStore {
  const links = new Map<string, WorkspaceAccessLink>()
  const canSend = (actorId: string) =>
    audit.records.filter(
      (record) =>
        record.actorUserId === actorId &&
        record.action === WORKSPACE_ACCESS_POLICY.invitationAuditAction &&
        record.createdAt.getTime() > Date.now() - WORKSPACE_ACCESS_POLICY.sendWindowMs,
    ).length < WORKSPACE_ACCESS_POLICY.sendsPerWindow
  const appendAudit = (
    organizationId: string,
    actorId: string,
    action: string,
    targetId: string,
  ) => {
    audit.records.push({
      id: crypto.randomUUID(),
      organizationId,
      actorUserId: actorId,
      actorName: tables.user.find((entry) => entry.id === actorId)?.name ?? '',
      action,
      targetType: 'workspace_access',
      targetId,
      createdAt: new Date(),
    })
  }
  const eligibleUser = (userId: string) =>
    tables.user.find(
      (entry) => entry.id === userId && entry.emailVerified === true && entry.banned !== true,
    )
  const membership = (orgId: string, userId: string) =>
    tables.member.find((entry) => entry.organizationId === orgId && entry.userId === userId)
  const isOwner = (orgId: string, userId: string) =>
    eligibleUser(userId) !== undefined && membership(orgId, userId)?.role === 'owner'
  const validLink = (tokenHash: string, userId: string) => {
    const account = eligibleUser(userId)
    return links
      .values()
      .find(
        (link) =>
          link.tokenHash === tokenHash &&
          link.revokedAt === null &&
          link.expiresAt.getTime() > Date.now() &&
          account !== undefined &&
          (link.email === null || link.email === account.email?.toLowerCase()) &&
          (link.acceptedUserId === null || link.acceptedUserId === userId) &&
          isOwner(link.organizationId, link.createdBy),
      )
  }
  return {
    read(organizationId, userId) {
      if (membership(organizationId, userId) === undefined || eligibleUser(userId) === undefined)
        return Promise.resolve(null)
      const hasOwnership = isOwner(organizationId, userId)
      const members = tables.member
        .filter((entry) => entry.organizationId === organizationId)
        .map((entry) => {
          const account = tables.user.find((candidate) => candidate.id === entry.userId)
          return {
            id: entry.id,
            userId: entry.userId,
            name: account?.name,
            email: account?.email,
            role: entry.role,
          }
        })
      return Promise.resolve({
        isOwner: hasOwnership,
        members: workspaceAccessSchema.shape.members.parse(members),
        links: hasOwnership
          ? links
              .values()
              .filter((link) => link.organizationId === organizationId)
              .toArray()
              .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
              .slice(0, WORKSPACE_ACCESS_POLICY.listLimit)
          : [],
      })
    },
    isOwner: (orgId, userId) => Promise.resolve(isOwner(orgId, userId)),
    existingUser: (email) =>
      Promise.resolve(
        tables.user.some(
          (entry) =>
            entry.email?.toLowerCase() === email &&
            entry.id !== undefined &&
            eligibleUser(entry.id) !== undefined,
        ),
      ),
    add(organizationId, ownerId, email, role) {
      const account = tables.user.find((entry) => entry.email?.toLowerCase() === email)
      if (
        !isOwner(organizationId, ownerId) ||
        account?.id === undefined ||
        eligibleUser(account.id) === undefined ||
        membership(organizationId, account.id) !== undefined
      )
        return Promise.resolve(false)
      tables.member.push({
        id: crypto.randomUUID(),
        organizationId,
        userId: account.id,
        role,
        createdAt: new Date(),
      })
      return Promise.resolve(true)
    },
    change(organizationId, ownerId, memberId, role) {
      const row = tables.member.find(
        (entry) => entry.organizationId === organizationId && entry.id === memberId,
      )
      if (row === undefined || row.role === 'owner' || !isOwner(organizationId, ownerId))
        return Promise.resolve(false)
      row.role = role
      return Promise.resolve(true)
    },
    remove(organizationId, ownerId, memberId) {
      const index = tables.member.findIndex(
        (entry) =>
          entry.organizationId === organizationId &&
          entry.id === memberId &&
          entry.role !== 'owner',
      )
      if (index === -1 || !isOwner(organizationId, ownerId)) return Promise.resolve(false)
      tables.member.splice(index, 1)
      return Promise.resolve(true)
    },
    createLink(link) {
      if (link.email !== null && !canSend(link.createdBy)) return Promise.resolve('rate-limited')
      if (
        !isOwner(link.organizationId, link.createdBy) ||
        links
          .values()
          .filter(
            (entry) =>
              entry.organizationId === link.organizationId &&
              entry.revokedAt === null &&
              entry.expiresAt.getTime() > Date.now(),
          )
          .toArray().length >= WORKSPACE_ACCESS_POLICY.activeLinkLimit
      )
        return Promise.resolve('denied')
      links.set(link.id, link)
      appendAudit(
        link.organizationId,
        link.createdBy,
        link.email === null
          ? 'workspace_access.link_created'
          : WORKSPACE_ACCESS_POLICY.invitationAuditAction,
        link.id,
      )
      return Promise.resolve('created')
    },
    reserveInvitationEmail(organizationId, actorId, invitationId) {
      if (!isOwner(organizationId, actorId) || !canSend(actorId)) return Promise.resolve(false)
      appendAudit(
        organizationId,
        actorId,
        WORKSPACE_ACCESS_POLICY.invitationAuditAction,
        invitationId,
      )
      return Promise.resolve(true)
    },
    revoke(organizationId, ownerId, linkId) {
      const link = links.get(linkId)
      if (!isOwner(organizationId, ownerId) || link?.organizationId !== organizationId)
        return Promise.resolve(null)
      link.revokedAt = new Date()
      return Promise.resolve(link)
    },
    preview(tokenHash, userId) {
      const link = validLink(tokenHash, userId)
      const workspace = tables.organization.find((entry) => entry.id === link?.organizationId)
      return Promise.resolve(
        link === undefined || workspace === undefined
          ? null
          : {
              link,
              workspaceName: workspace.name,
              isMember: membership(link.organizationId, userId) !== undefined,
            },
      )
    },
    accept(tokenHash, userId) {
      const link = validLink(tokenHash, userId)
      if (link === undefined) return Promise.resolve(null)
      if (membership(link.organizationId, userId) === undefined)
        tables.member.push({
          id: crypto.randomUUID(),
          organizationId: link.organizationId,
          userId,
          role: link.role,
          createdAt: new Date(),
        })
      if (link.email !== null) link.acceptedUserId = userId
      return Promise.resolve(link.organizationId)
    },
  }
}
