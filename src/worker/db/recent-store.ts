import { and, desc, eq, inArray, notInArray, sql } from 'drizzle-orm'

import type { Database } from './client'
import { recentActivity, recentViewPreference } from './schema'
import { RECENT_HISTORY_LIMIT } from '../../shared/recent-work'
import type { RecentStore } from '../recent-store'

/** D1 keeps an independent bounded history and display preference for each account. */
export function createDrizzleRecentStore(db: Database): RecentStore {
  return {
    async list(userId, organizationId) {
      return await db
        .select()
        .from(recentActivity)
        .where(
          and(eq(recentActivity.userId, userId), eq(recentActivity.organizationId, organizationId)),
        )
        .orderBy(desc(recentActivity.usedAt), recentActivity.id)
        .limit(RECENT_HISTORY_LIMIT)
    },
    async record(activity) {
      const id = JSON.stringify([
        activity.userId,
        activity.organizationId,
        activity.kind,
        activity.resourceId,
      ])
      const scope = and(
        eq(recentActivity.userId, activity.userId),
        eq(recentActivity.organizationId, activity.organizationId),
      )
      const newest = db
        .select({ id: recentActivity.id })
        .from(recentActivity)
        .where(scope)
        .orderBy(desc(recentActivity.usedAt), recentActivity.id)
        .limit(RECENT_HISTORY_LIMIT)
      const stale = and(scope, notInArray(recentActivity.id, newest))
      await db.batch([
        db
          .insert(recentActivity)
          .values({ id, ...activity })
          .onConflictDoUpdate({
            target: recentActivity.id,
            set: { usedAt: sql`max(${recentActivity.usedAt}, ${activity.usedAt.getTime()})` },
          }),
        db.delete(recentActivity).where(stale),
      ])
    },
    async removeMany(userId, organizationId, resources) {
      if (resources.length === 0) return
      const ids = resources.map((resource) =>
        JSON.stringify([userId, organizationId, resource.kind, resource.resourceId]),
      )
      await db
        .delete(recentActivity)
        .where(
          and(
            eq(recentActivity.userId, userId),
            eq(recentActivity.organizationId, organizationId),
            inArray(recentActivity.id, ids),
          ),
        )
    },
    async view(userId) {
      const [row] = await db
        .select()
        .from(recentViewPreference)
        .where(eq(recentViewPreference.userId, userId))
        .limit(1)
      return row?.view ?? null
    },
    async setView(userId, view) {
      await db
        .insert(recentViewPreference)
        .values({ userId, view })
        .onConflictDoUpdate({ target: recentViewPreference.userId, set: { view } })
    },
  }
}
