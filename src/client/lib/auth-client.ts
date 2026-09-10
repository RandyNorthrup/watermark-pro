import { adminClient, organizationClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

import { createAuthAccountHooks, withAuthAccountBoundary } from './auth-account'
import { accessControl, roles } from '../../shared/permissions'
import type { ShellOrganization } from '../../shared/shell-cache'

/**
 * Better Auth browser client. Talks to `/api/auth/*` on the same origin, so
 * no base URL is configured. The organization plugin receives the same access
 * control statements as the server so `checkRolePermission` can hide controls
 * a user cannot use; the server remains the only enforcement point.
 */
export const authClient = withAuthAccountBoundary(
  createAuthClient({
    basePath: '/api/auth',
    fetchOptions: createAuthAccountHooks(),
    plugins: [organizationClient({ ac: accessControl, roles }), adminClient()],
  }),
)

export type { ShellSession as SessionData } from '../../shared/shell-cache'
export type ActiveOrganization = ShellOrganization
export type OrganizationMember = ActiveOrganization['members'][number]
export type OrganizationInvitation = ActiveOrganization['invitations'][number]
