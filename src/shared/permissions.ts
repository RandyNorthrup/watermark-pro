/**
 * Role-based access control model shared by the Worker and the client.
 *
 * Organizations are the tenancy boundary. Every member holds exactly one of
 * the roles below. The statements describe every resource/action pair the
 * application knows about; a role is a subset of them. The Worker enforces
 * these through `requirePermission`; the client uses the same object only to
 * hide controls the user cannot use (never as a security boundary).
 */
import { createAccessControl } from 'better-auth/plugins/access'
import { adminAc, defaultStatements, ownerAc } from 'better-auth/plugins/organization/access'

export const statement = {
  ...defaultStatements,
  watermark: ['create', 'read', 'update', 'delete'],
  photo: ['upload', 'read', 'delete', 'export'],
  job: ['run'],
  share: ['create', 'revoke'],
  audit: ['read'],
} as const

export const accessControl = createAccessControl(statement)

const productionStatements = {
  watermark: ['create', 'read', 'update', 'delete'],
  photo: ['upload', 'read', 'delete', 'export'],
  job: ['run'],
  share: ['create', 'revoke'],
} as const

const readOnlyStatements = {
  watermark: ['read'],
  photo: ['read'],
} as const

export const roles = {
  owner: accessControl.newRole({
    ...ownerAc.statements,
    ...productionStatements,
    audit: ['read'],
  }),
  admin: accessControl.newRole({
    ...adminAc.statements,
    ...productionStatements,
    audit: ['read'],
  }),
  editor: accessControl.newRole(productionStatements),
  viewer: accessControl.newRole(readOnlyStatements),
}

export const ORGANIZATION_ROLES = ['owner', 'admin', 'editor', 'viewer'] as const

export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number]

/** Roles a user may assign when inviting or promoting; `owner` transfers are a separate flow. */
export const ASSIGNABLE_ROLES = ['admin', 'editor', 'viewer'] as const

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number]

export function isOrganizationRole(value: string): value is OrganizationRole {
  return (ORGANIZATION_ROLES as readonly string[]).includes(value)
}

/** One resource/action pair from `statement`, e.g. `{ audit: ['read'] }`. */
export type PermissionRequest = {
  [Resource in keyof typeof statement]?: readonly (typeof statement)[Resource][number][]
}
