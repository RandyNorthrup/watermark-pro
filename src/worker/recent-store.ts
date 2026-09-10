import type { RecentActivity, RecentView } from '../shared/recent-work'

export interface RecentActivityRecord extends Omit<RecentActivity, 'usedAt'> {
  userId: string
  organizationId: string
  usedAt: Date
}

/** History contains the current user's own activity, never workspace-wide access records. */
export interface RecentStore {
  list(userId: string, organizationId: string): Promise<RecentActivityRecord[]>
  record(activity: RecentActivityRecord): Promise<void>
  removeMany(
    userId: string,
    organizationId: string,
    resources: readonly Pick<RecentActivity, 'kind' | 'resourceId'>[],
  ): Promise<void>
  view(userId: string): Promise<RecentView | null>
  setView(userId: string, view: RecentView): Promise<void>
}
