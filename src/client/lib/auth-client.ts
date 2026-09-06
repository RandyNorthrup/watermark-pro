import { adminClient, organizationClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

import { accessControl, roles } from '../../shared/permissions'

/**
 * Better Auth browser client. Talks to `/api/auth/*` on the same origin, so
 * no base URL is configured. The organization plugin receives the same access
 * control statements as the server so `checkRolePermission` can hide controls
 * a user cannot use; the server remains the only enforcement point.
 */
export const authClient = createAuthClient({
  basePath: '/api/auth',
  plugins: [organizationClient({ ac: accessControl, roles }), adminClient()],
})

export type SessionData = NonNullable<ReturnType<typeof authClient.useSession>['data']>
export type ActiveOrganization = NonNullable<
  ReturnType<typeof authClient.useActiveOrganization>['data']
>
export type OrganizationMember = ActiveOrganization['members'][number]
export type OrganizationInvitation = ActiveOrganization['invitations'][number]
