import { captureOfflineOwner } from './offline-context'
import { reportRecentWorkProblem } from './recent-work-notifications'
import type { RecentResource } from '../../shared/recent-work'

/** Loading activity persistence must not add the full dashboard data layer to app boot. */
export function noteRecentWork(organizationId: string, resource: RecentResource): void {
  const owner = captureOfflineOwner()
  const usedAt = new Date().toISOString()
  void import('./recent-work')
    .then(async (module) => {
      owner.assertCurrent()
      await module.recordRecentWork(organizationId, resource, usedAt)
    })
    .catch(() => {
      try {
        owner.assertCurrent()
      } catch {
        return
      }
      reportRecentWorkProblem(organizationId)
    })
}
