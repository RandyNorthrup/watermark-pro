import type { WorkspacePlanRecord } from '../shared/plans'

/** Server persistence of independent base grants and reconciled paid-period authority. */
export interface PlanStore {
  get(organizationId: string): Promise<WorkspacePlanRecord>
}
