import { sql } from 'drizzle-orm'

import { SITE_ROLE } from '../../shared/site-roles'
import type { UserStore } from '../stores'
import type { Database } from './client'

/** D1-backed account roles; only the promotion the dev route needs. */
export function createDrizzleUserStore(db: Database): UserStore {
  return {
    async promoteToSiteOwner(email) {
      const rows = await db.all<{ id: string }>(sql`
        UPDATE user SET role = ${SITE_ROLE.owner}
                WHERE email = ${email} AND (NOT EXISTS (SELECT 1 FROM site_owner) OR id = (SELECT user_id FROM site_owner WHERE id = 1))
                RETURNING id
      `)
      return rows.length > 0
    },
  }
}
