import { eq } from 'drizzle-orm'

import { PLATFORM_ADMIN_ROLE } from '../../shared/constants'
import type { UserStore } from '../stores'
import type { Database } from './client'
import { user } from './schema'

/** D1-backed account roles; only the promotion the dev route needs. */
export function createDrizzleUserStore(db: Database): UserStore {
  return {
    async promoteToPlatformAdmin(email) {
      const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email))
      if (existing === undefined) {
        return false
      }
      await db.update(user).set({ role: PLATFORM_ADMIN_ROLE }).where(eq(user.id, existing.id))
      return true
    },
  }
}
