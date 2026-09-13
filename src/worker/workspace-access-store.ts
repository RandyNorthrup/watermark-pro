import type { WorkspaceAccessData, WorkspaceGrantRole } from '../shared/workspace-access'

export interface WorkspaceAccessLink {
  id: string
  organizationId: string
  createdBy: string
  tokenHash: string
  role: WorkspaceGrantRole
  email: string | null
  createdAt: Date
  expiresAt: Date
  revokedAt: Date | null
  acceptedUserId: string | null
  siteInvitationId: string | null
}

/** Every mutation rechecks the current owner in the same atomic database operation. */
export interface WorkspaceAccessStore {
  read(
    organizationId: string,
    userId: string,
  ): Promise<{
    members: WorkspaceAccessData['members']
    isOwner: boolean
    links: WorkspaceAccessLink[]
  } | null>
  isOwner(organizationId: string, userId: string): Promise<boolean>
  existingUser(email: string): Promise<boolean>
  add(
    organizationId: string,
    ownerId: string,
    email: string,
    role: WorkspaceGrantRole,
  ): Promise<boolean>
  change(
    organizationId: string,
    ownerId: string,
    memberId: string,
    role: WorkspaceGrantRole,
  ): Promise<boolean>
  remove(organizationId: string, ownerId: string, memberId: string): Promise<boolean>
  createLink(link: WorkspaceAccessLink): Promise<'created' | 'rate-limited' | 'denied'>
  /** Compatibility email endpoint consumes the same sender-wide durable ledger. */
  reserveInvitationEmail(
    organizationId: string,
    actorId: string,
    invitationId: string,
  ): Promise<boolean>
  revoke(
    organizationId: string,
    ownerId: string,
    linkId: string,
  ): Promise<WorkspaceAccessLink | null>
  preview(
    tokenHash: string,
    userId: string,
  ): Promise<{ link: WorkspaceAccessLink; workspaceName: string; isMember: boolean } | null>
  accept(tokenHash: string, userId: string): Promise<string | null>
}
