import type { Database } from './client'
import { guidanceClaim } from './schema'
import type { GuidanceStore } from '../guidance-store'

/** D1 uniqueness makes concurrent devices compete for one display, without a reset endpoint. */
export function createDrizzleGuidanceStore(db: Database): GuidanceStore {
  return {
    async claim(userId, topic) {
      const rows = await db
        .insert(guidanceClaim)
        .values({ userId, topic })
        .onConflictDoNothing()
        .returning({ topic: guidanceClaim.topic })
      return rows.length === 1
    },
  }
}
