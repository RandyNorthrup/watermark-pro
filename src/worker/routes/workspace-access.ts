import { Hono } from 'hono'
import type { Context } from 'hono'
import type { ZodType } from 'zod'

import { accountIdSchema } from '../../shared/account-identity'
import { SITE_INVITATION_POLICY } from '../../shared/api-accounts'
import { HTTP_STATUS } from '../../shared/constants'
import {
  WORKSPACE_ACCESS_POLICY,
  workspaceAccessSchema,
  workspaceGrantRequestSchema,
  workspaceInvitationAcceptedSchema,
  workspaceInvitationPreviewSchema,
  workspaceLinkCreatedSchema,
  workspaceLinkDtoSchema,
  workspaceLinkRequestSchema,
  workspaceLinkTokenSchema,
  workspaceRoleRequestSchema,
  type WorkspaceGrantRole,
  type WorkspaceLinkDto,
} from '../../shared/workspace-access'
import type { SiteInvitationRecord } from '../account-store'
import type { AppContext } from '../app-context'
import { invitationTokenHash } from '../auth/invitation-admission'
import { workspaceInvitationEmail } from '../auth/templates'
import { apiErrors } from '../errors'
import { requireSession } from '../middleware/session'
import { readJsonBody } from '../request-body'
import type { WorkspaceAccessLink, WorkspaceAccessStore } from '../workspace-access-store'

function requireLinkCreated(result: Awaited<ReturnType<WorkspaceAccessStore['createLink']>>) {
  if (result === 'rate-limited')
    throw apiErrors.rateLimited(WORKSPACE_ACCESS_POLICY.sendWindowSeconds)
  if (result !== 'created') throw apiErrors.conflict()
}

function linkDto(link: WorkspaceAccessLink): WorkspaceLinkDto {
  let status: WorkspaceLinkDto['status'] = 'pending'
  if (link.revokedAt !== null) status = 'revoked'
  else if (link.expiresAt.getTime() <= Date.now()) status = 'expired'
  else if (link.acceptedUserId !== null) status = 'accepted'
  return workspaceLinkDtoSchema.parse({
    id: link.id,
    role: link.role,
    email: link.email,
    expiresAt: link.expiresAt.toISOString(),
    status,
  })
}

function id(value: string | undefined): string {
  const parsed = accountIdSchema.safeParse(value)
  if (!parsed.success) throw apiErrors.validation('Invalid workspace or access ID')
  return parsed.data
}

async function body<T>(c: Context<AppContext>, schema: ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(
    await readJsonBody(c.req.raw, WORKSPACE_ACCESS_POLICY.requestBytes),
  )
  if (!parsed.success) throw apiErrors.validation(parsed.error.issues)
  return parsed.data
}

async function requireOwner(c: Context<AppContext>): Promise<string> {
  const organizationId = id(c.req.param('orgId'))
  if (!(await c.get('services').workspaceAccess.isOwner(organizationId, c.get('session').user.id)))
    throw apiErrors.forbidden()
  return organizationId
}

function newLink(
  organizationId: string,
  createdBy: string,
  role: WorkspaceGrantRole,
  tokenHash: string,
  days: number,
): WorkspaceAccessLink {
  return {
    id: crypto.randomUUID(),
    organizationId,
    createdBy,
    tokenHash,
    role,
    email: null,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + days * WORKSPACE_ACCESS_POLICY.millisecondsPerDay),
    revokedAt: null,
    acceptedUserId: null,
    siteInvitationId: null,
  }
}

function bearerToken(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`
}

async function tokenHash(c: Context<AppContext>): Promise<string> {
  const parsed = workspaceLinkTokenSchema.safeParse(c.req.param('token'))
  if (!parsed.success) throw apiErrors.notFound()
  return await invitationTokenHash(parsed.data)
}

export const workspaceAccessRoutes = new Hono<AppContext>()
  .get('/orgs/:orgId/access', requireSession, async (c) => {
    const access = await c
      .get('services')
      .workspaceAccess.read(id(c.req.param('orgId')), c.get('session').user.id)
    if (access === null) throw apiErrors.forbidden()
    return c.json(
      workspaceAccessSchema.parse({ ...access, links: access.links.map((link) => linkDto(link)) }),
    )
  })
  .post('/orgs/:orgId/access/members', requireSession, async (c) => {
    const organizationId = await requireOwner(c)
    const input = await body(c, workspaceGrantRequestSchema)
    const { workspaceAccess, accounts, email, config, auth } = c.get('services')
    const actor = c.get('session').user
    if (!input.notify) {
      if (!(await workspaceAccess.add(organizationId, actor.id, input.email, input.role)))
        throw apiErrors.conflict()
      return c.body(null, HTTP_STATUS.noContent)
    }
    const token = bearerToken()
    const link = newLink(
      organizationId,
      actor.id,
      input.role,
      await invitationTokenHash(token),
      WORKSPACE_ACCESS_POLICY.defaultLinkDays,
    )
    link.email = input.email
    let admission: SiteInvitationRecord | null = null
    let signupUrl: string | null = null
    if (!(await workspaceAccess.existingUser(input.email))) {
      const admissionToken = bearerToken()
      admission = {
        id: crypto.randomUUID(),
        inviterId: actor.id,
        email: input.email,
        role: 'user',
        tokenHash: await invitationTokenHash(admissionToken),
        createdAt: new Date(),
        expiresAt: link.expiresAt,
        acceptedAt: null,
        acceptedUserId: null,
        revokedAt: null,
      }
      if (!(await accounts.createInvitation(admission)))
        throw apiErrors.rateLimited(SITE_INVITATION_POLICY.sendWindowSeconds)
      link.siteInvitationId = admission.id
      signupUrl = `${config.APP_URL}/signup?invitation=${admissionToken}`
    }
    try {
      requireLinkCreated(await workspaceAccess.createLink(link))
      const workspace = await auth.api.getFullOrganization({
        headers: c.req.raw.headers,
        query: { organizationId },
      })
      if (workspace === null) throw apiErrors.forbidden()
      await email.send(
        workspaceInvitationEmail(
          input.email,
          workspace.name,
          actor.name,
          `${config.APP_URL}/workspace-invitation/${token}`,
          input.role,
          signupUrl,
        ),
      )
    } catch (error) {
      await workspaceAccess.revoke(organizationId, actor.id, link.id)
      if (admission !== null) await accounts.revokeInvitation(actor.id, admission.id)
      throw error
    }
    return c.body(null, HTTP_STATUS.noContent)
  })
  .patch('/orgs/:orgId/access/members/:memberId', requireSession, async (c) => {
    const organizationId = await requireOwner(c)
    const input = await body(c, workspaceRoleRequestSchema)
    const memberId = id(c.req.param('memberId'))
    if (
      !(await c
        .get('services')
        .workspaceAccess.change(organizationId, c.get('session').user.id, memberId, input.role))
    )
      throw apiErrors.forbidden()
    return c.body(null, HTTP_STATUS.noContent)
  })
  .delete('/orgs/:orgId/access/members/:memberId', requireSession, async (c) => {
    const organizationId = await requireOwner(c)
    const memberId = id(c.req.param('memberId'))
    if (
      !(await c
        .get('services')
        .workspaceAccess.remove(organizationId, c.get('session').user.id, memberId))
    )
      throw apiErrors.forbidden()
    return c.body(null, HTTP_STATUS.noContent)
  })
  .post('/orgs/:orgId/access/links', requireSession, async (c) => {
    const organizationId = await requireOwner(c)
    const input = await body(c, workspaceLinkRequestSchema)
    const token = bearerToken()
    const link = newLink(
      organizationId,
      c.get('session').user.id,
      input.role,
      await invitationTokenHash(token),
      input.days,
    )
    requireLinkCreated(await c.get('services').workspaceAccess.createLink(link))
    return c.json(
      workspaceLinkCreatedSchema.parse({
        link: linkDto(link),
        url: `${c.get('services').config.APP_URL}/workspace-invitation/${token}`,
      }),
      HTTP_STATUS.created,
    )
  })
  .delete('/orgs/:orgId/access/links/:linkId', requireSession, async (c) => {
    const organizationId = await requireOwner(c)
    const { workspaceAccess, accounts } = c.get('services')
    const actorId = c.get('session').user.id
    const link = await workspaceAccess.revoke(organizationId, actorId, id(c.req.param('linkId')))
    if (link === null) throw apiErrors.notFound()
    if (link.siteInvitationId !== null)
      await accounts.revokeInvitation(actorId, link.siteInvitationId)
    return c.body(null, HTTP_STATUS.noContent)
  })
  .get('/me/workspace-invitations/:token', requireSession, async (c) => {
    const preview = await c
      .get('services')
      .workspaceAccess.preview(await tokenHash(c), c.get('session').user.id)
    if (preview === null) throw apiErrors.notFound()
    return c.json(
      workspaceInvitationPreviewSchema.parse({
        workspaceName: preview.workspaceName,
        role: preview.link.role,
        isMember: preview.isMember,
      }),
    )
  })
  .post('/me/workspace-invitations/:token/accept', requireSession, async (c) => {
    const organizationId = await c
      .get('services')
      .workspaceAccess.accept(await tokenHash(c), c.get('session').user.id)
    if (organizationId === null) throw apiErrors.notFound()
    return c.json(workspaceInvitationAcceptedSchema.parse({ organizationId }))
  })
