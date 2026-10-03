import type { CloudOperationSpend } from '../shared/cloud-operations'
import type { WorkspacePlanRecord } from '../shared/plans'

/** Server persistence of independent base grants and reconciled paid-period authority. */
export interface PlanStore {
  /** Atomic authorized spend also debits the deletion-resistant site aggregate. */
  spendOperations(input: CloudOperationSpend): Promise<void>
  get(organizationId: string): Promise<WorkspacePlanRecord>
}
