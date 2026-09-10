/** Site management roles are independent of membership in any workspace. */
import { z } from 'zod'

/** Account roles do not grant membership in any workspace. */
export const SITE_ROLE = { owner: 'owner', admin: 'admin', user: 'user' } as const
/** Persisted account roles must be single canonical values. */
export const siteRoleSchema = z.enum(SITE_ROLE)
/** Site ownership is established once; invitations and user editing cannot assign it. */
export const assignableSiteRoleSchema = z.enum([SITE_ROLE.user, SITE_ROLE.admin])
/** A global account role, separate from workspace membership. */
export type SiteRole = z.infer<typeof siteRoleSchema>
/** Roles managers may grant without replacing site ownership. */
export type AssignableSiteRole = z.infer<typeof assignableSiteRoleSchema>

/** Only the authenticated user's site role grants site-management access. */
export function canManageSite(role: unknown): boolean {
  return role === SITE_ROLE.owner || role === SITE_ROLE.admin
}
