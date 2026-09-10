/** A verified shell snapshot whose linked identities must agree before any query is seeded. */
import { z } from 'zod/mini'

import { accountIdSchema } from './account-identity'
import {
  shellOrganizationSchema,
  shellOrganizationsSchema,
  shellRoleSchema,
  shellSessionSchema,
} from './shell-cache'

export const BOOTSTRAP_PATH = '/api/me/bootstrap'
export const BOOTSTRAP_REQUEST_BYTES = 1024
export const bootstrapRequestSchema = z.strictObject({})

const snapshotInput = z.object({
  session: shellSessionSchema,
  organizations: shellOrganizationsSchema,
  organization: z.nullable(shellOrganizationSchema),
  role: z.nullable(shellRoleSchema),
  selectionRequired: z.boolean(),
})

export const bootstrapSnapshotSchema = snapshotInput.check(
  z.refine((snapshot) => {
    const { session, organizations, organization, role, selectionRequired } = snapshot
    if (!session.user.emailVerified || !accountIdSchema.safeParse(session.user.id).success)
      return false
    const ids = organizations.map((item) => item.id)
    if (
      new Set(ids).size !== ids.length ||
      ids.some((id) => !accountIdSchema.safeParse(id).success)
    )
      return false
    if (selectionRequired)
      return (
        session.session.activeOrganizationId === null &&
        organization === null &&
        role === null &&
        ids.length > 0
      )
    if (
      organization === null ||
      role === null ||
      organization.id !== session.session.activeOrganizationId ||
      !ids.includes(organization.id)
    )
      return false
    const member = organization.members.find((item) => item.userId === session.user.id)
    return (
      member?.role === role.role &&
      organization.members.every(
        (item) => item.organizationId === organization.id && item.userId === item.user.id,
      ) &&
      organization.invitations.every((item) => item.organizationId === organization.id)
    )
  }, 'Bootstrap account, workspace, membership, and role must match.'),
)

export type BootstrapSnapshot = z.infer<typeof bootstrapSnapshotSchema>
