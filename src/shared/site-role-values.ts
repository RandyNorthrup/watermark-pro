/** Account roles do not grant membership in any workspace. */
export const SITE_ROLE = { owner: 'owner', admin: 'admin', user: 'user' } as const

/** A global account role, separate from workspace membership. */
export type SiteRole = (typeof SITE_ROLE)[keyof typeof SITE_ROLE]

/** Roles managers may grant without replacing site ownership. */
export type AssignableSiteRole = typeof SITE_ROLE.admin | typeof SITE_ROLE.user

/** Only the authenticated user's site role grants site-management access. */
export function canManageSite(role: unknown): boolean {
  return role === SITE_ROLE.owner || role === SITE_ROLE.admin
}
