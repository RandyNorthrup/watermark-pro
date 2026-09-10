import { RECENT_HISTORY_LIMIT, type RecentView } from '../../shared/recent-work'
import type { RecentActivityRecord, RecentStore } from '../recent-store'

/** Test storage preserves the same independent history and monotonic replay rules as D1. */
export function createMemoryRecentStore(): RecentStore {
  const records = new Map<string, RecentActivityRecord>()
  const views = new Map<string, RecentView>()
  function key(row: Omit<RecentActivityRecord, 'usedAt'>) {
    return JSON.stringify([row.userId, row.organizationId, row.kind, row.resourceId])
  }
  function list(userId: string, organizationId: string) {
    return records
      .values()
      .filter((row) => row.userId === userId && row.organizationId === organizationId)
      .toArray()
      .toSorted((a, b) => b.usedAt.getTime() - a.usedAt.getTime() || key(a).localeCompare(key(b)))
  }
  return {
    list(userId, organizationId) {
      return Promise.resolve(list(userId, organizationId))
    },
    record(activity) {
      const previous = records.get(key(activity))
      if (previous === undefined || previous.usedAt <= activity.usedAt)
        records.set(key(activity), activity)
      for (const stale of list(activity.userId, activity.organizationId).slice(
        RECENT_HISTORY_LIMIT,
      ))
        records.delete(key(stale))
      return Promise.resolve()
    },
    removeMany(userId, organizationId, resources) {
      for (const resource of resources) records.delete(key({ userId, organizationId, ...resource }))
      return Promise.resolve()
    },
    view(userId) {
      return Promise.resolve(views.get(userId) ?? null)
    },
    setView(userId, view) {
      views.set(userId, view)
      return Promise.resolve()
    },
  }
}
