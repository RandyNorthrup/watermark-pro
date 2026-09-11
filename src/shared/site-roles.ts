/** Site management roles are independent of membership in any workspace. */
import { z } from 'zod'

import { SITE_ROLE } from './site-role-values'

export { canManageSite, SITE_ROLE } from './site-role-values'
export type { AssignableSiteRole, SiteRole } from './site-role-values'

/** Persisted account roles must be single canonical values. */
export const siteRoleSchema = z.enum(SITE_ROLE)
/** Site ownership is established once; invitations and user editing cannot assign it. */
export const assignableSiteRoleSchema = z.enum([SITE_ROLE.user, SITE_ROLE.admin])
