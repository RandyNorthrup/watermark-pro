import { captureOfflineOwner, currentOfflineUser } from './offline-context'

export const RECENT_WORK_CHANGED_EVENT = 'lumafoil:recent-work-changed'
const problem = { owner: '', organizationId: '', message: null as string | null }

export function notifyRecentWork(): void {
  window.dispatchEvent(new Event(RECENT_WORK_CHANGED_EVENT))
}

/** The persistence layer and lazy activity entry point share state without importing each other. */
export function reportRecentWorkProblem(organizationId: string): void {
  problem.owner = captureOfflineOwner().userId
  problem.organizationId = organizationId
  problem.message = 'Recent work could not be updated. Reopen the item to try again.'
  notifyRecentWork()
}

/** Clear only the current workspace's tracking error, or all state at an account boundary. */
export function clearRecentWorkProblem(organizationId?: string): void {
  if (
    organizationId === undefined ||
    (problem.owner === currentOfflineUser() && problem.organizationId === organizationId)
  )
    problem.message = null
}

/** A tracking failure never changes the result of a successful content save. */
export function recentWorkProblem(organizationId: string): string | null {
  return problem.owner === currentOfflineUser() && problem.organizationId === organizationId
    ? problem.message
    : null
}
