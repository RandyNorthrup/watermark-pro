/** Site invitations concern admission only; collaboration uses separate authenticated endpoints. */
import { Hono } from 'hono'

import {
  accountStatsSchema,
  privateWorkspaceSchema,
  SITE_INVITATION_POLICY,
  siteInvitationDtoSchema,
  siteInvitationListSchema,
  siteInvitationRequestSchema,
  type SiteInvitationDto,
} from '../../shared/api-accounts'
import { BOOTSTRAP_REQUEST_BYTES, bootstrapRequestSchema } from '../../shared/bootstrap'
import { HTTP_STATUS } from '../../shared/constants'
import { invitationIdSchema } from '../../shared/invitation'
import { SITE_ROLE } from '../../shared/site-roles'
import type { SiteInvitationRecord } from '../account-store'
import type { AppContext } from '../app-context'
import { invitationTokenHash } from '../auth/invitation-admission'
import { ensurePrivateWorkspace } from '../auth/private-workspace'
import { hasSiteManagementAccess } from '../auth/site-administrator'
import { siteInvitationEmail } from '../auth/templates'
import { bootstrapAccount } from '../bootstrap'
import { apiErrors } from '../errors'
import { requirePlatformAdmin } from '../middleware/platform-admin'
import { requireSession } from '../middleware/session'
import { readJsonBody } from '../request-body'

function invitationDto(record: SiteInvitationRecord): SiteInvitationDto {
  let status: SiteInvitationDto['status'] = 'pending'
  if (record.acceptedAt !== null) status = 'accepted'
  else if (record.revokedAt !== null) status = 'revoked'
  else if (record.expiresAt.getTime() <= Date.now()) status = 'expired'
  return siteInvitationDtoSchema.parse({
    id: record.id,
    email: record.email,
    role: record.role,
    status,
    createdAt: record.createdAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
  })
}

export const accountRoutes = new Hono<AppContext>()
  .post('/me/bootstrap', requireSession, async (c) => {
    const parsed = bootstrapRequestSchema.safeParse(
      await readJsonBody(c.req.raw, BOOTSTRAP_REQUEST_BYTES),
    )
    if (!parsed.success) throw apiErrors.validation(parsed.error.issues)
    return c.json(await bootstrapAccount(c.get('services'), c.get('session'), c.req.raw.headers))
  })
  .get('/me/invitations', requireSession, async (c) => {
    const records = await c.get('services').accounts.listInvitations(c.get('session').user.id)
    return c.json(
      siteInvitationListSchema.parse({
        invitations: records.map((record) => invitationDto(record)),
      }),
      HTTP_STATUS.ok,
    )
  })
  .post('/me/invitations', requireSession, async (c) => {
    const { accounts, audit, email, config } = c.get('services')
    const inviter = c.get('session').user
    if (!inviter.emailVerified) throw apiErrors.forbidden()
    const input = siteInvitationRequestSchema.safeParse(
      await readJsonBody(c.req.raw, SITE_INVITATION_POLICY.requestBytes),
    )
    if (!input.success) throw apiErrors.validation(input.error.issues)
    if (
      input.data.role === SITE_ROLE.admin &&
      !hasSiteManagementAccess(inviter, await accounts.siteOwnerId())
    )
      throw apiErrors.forbidden()
    // Two UUIDs provide an unguessable bearer token, separate from the public record id.
    const token = `${crypto.randomUUID()}${crypto.randomUUID()}`
    const record: SiteInvitationRecord = {
      id: crypto.randomUUID(),
      inviterId: inviter.id,
      email: input.data.email.toLowerCase(),
      role: input.data.role,
      tokenHash: await invitationTokenHash(token),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + SITE_INVITATION_POLICY.expiresInMs),
      acceptedAt: null,
      acceptedUserId: null,
      revokedAt: null,
    }
    if (!(await accounts.createInvitation(record)))
      throw apiErrors.rateLimited(SITE_INVITATION_POLICY.sendWindowSeconds)
    try {
      await email.send(
        siteInvitationEmail(
          record.email,
          inviter.name,
          `${config.APP_URL}/signup?invitation=${token}`,
        ),
      )
    } catch (error) {
      await accounts.revokeInvitation(inviter.id, record.id)
      throw error
    }
    await audit.append({
      actorUserId: inviter.id,
      actorName: inviter.name,
      action: 'site_invitation.created',
      targetType: 'site_invitation',
      targetId: record.id,
      metadata: { role: record.role },
    })
    return c.json(invitationDto(record), HTTP_STATUS.created)
  })
  .delete('/me/invitations/:id', requireSession, async (c) => {
    const id = invitationIdSchema.safeParse(c.req.param('id'))
    if (!id.success) throw apiErrors.validation(id.error.issues)
    const { accounts, audit } = c.get('services')
    const inviter = c.get('session').user
    if (!(await accounts.revokeInvitation(inviter.id, id.data))) throw apiErrors.notFound()
    await audit.append({
      actorUserId: inviter.id,
      actorName: inviter.name,
      action: 'site_invitation.revoked',
      targetType: 'site_invitation',
      targetId: id.data,
    })
    return c.body(null, HTTP_STATUS.noContent)
  })
  .post('/me/workspace', requireSession, async (c) => {
    const services = c.get('services')
    const { auth } = services
    const organizationId = await ensurePrivateWorkspace(services, c.get('session'))
    await auth.api.setActiveOrganization({ headers: c.req.raw.headers, body: { organizationId } })
    return c.json(privateWorkspaceSchema.parse({ organizationId }), HTTP_STATUS.ok)
  })
  .get('/admin/account-stats', requireSession, requirePlatformAdmin, async (c) => {
    return c.json(
      accountStatsSchema.parse(await c.get('services').accounts.statistics()),
      HTTP_STATUS.ok,
    )
  })
