/** One server-owned bootstrap combines the existing authentication and workspace operations. */
import { APIError } from 'better-auth/api'

import { ACCOUNT_ID_HEADER } from '../shared/account-identity'
import { bootstrapSnapshotSchema, type BootstrapSnapshot } from '../shared/bootstrap'
import { HTTP_STATUS } from '../shared/constants'
import {
  shellOrganizationSchema,
  shellOrganizationsSchema,
  shellSessionSchema,
} from '../shared/shell-cache'
import type { AuthSession } from './auth/auth'
import { ensurePrivateWorkspace } from './auth/private-workspace'
import { apiErrors } from './errors'
import type { Services } from './services'

/** Produce only the caller's verified display state; selected collaboration remains selected. */
export async function bootstrapAccount(
  services: Pick<Services, 'accounts' | 'auth'>,
  authenticated: AuthSession,
  requestHeaders: Headers,
): Promise<BootstrapSnapshot> {
  const personalId = await ensurePrivateWorkspace(services, authenticated)
  const headers = new Headers(requestHeaders)
  headers.set(ACCOUNT_ID_HEADER, authenticated.user.id)
  try {
    const organizations = shellOrganizationsSchema.parse(
      await services.auth.api.listOrganizations({ headers }),
    )
    if (organizations.every((organization) => organization.id !== personalId))
      throw apiErrors.forbidden()
    const session = shellSessionSchema.parse(authenticated)
    const selected = session.session.activeOrganizationId
    if (selected !== null && organizations.every((organization) => organization.id !== selected)) {
      await services.auth.api.setActiveOrganization({ headers, body: { organizationId: null } })
      session.session.activeOrganizationId = null
      return bootstrapSnapshotSchema.parse({
        session,
        organizations,
        organization: null,
        role: null,
        selectionRequired: true,
      })
    }
    const organizationId = selected ?? personalId
    if (selected === null) {
      await services.auth.api.setActiveOrganization({ headers, body: { organizationId } })
      session.session.activeOrganizationId = organizationId
    }
    const result = await services.auth.api.getFullOrganization({
      headers,
      query: { organizationId },
    })
    if (result === null) throw apiErrors.forbidden()
    const organization = shellOrganizationSchema.parse(result)
    const member = organization.members.find((item) => item.userId === session.user.id)
    if (member === undefined) throw apiErrors.forbidden()
    return bootstrapSnapshotSchema.parse({
      session,
      organizations,
      organization,
      role: { role: member.role },
      selectionRequired: false,
    })
  } catch (error) {
    if (error instanceof APIError) {
      if (error.statusCode === HTTP_STATUS.unauthorized) throw apiErrors.unauthenticated()
      if (error.statusCode === HTTP_STATUS.forbidden) throw apiErrors.forbidden()
    }
    throw error
  }
}
