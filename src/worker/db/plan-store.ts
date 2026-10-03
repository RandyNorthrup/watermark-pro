import { eq, sql } from 'drizzle-orm'

import { cloudOperationSpendSchema } from '../../shared/cloud-operations'
import { MILLISECONDS_PER_SECOND } from '../../shared/constants'
import { workspacePlanRecordSchema } from '../../shared/plans'
import { apiErrors } from '../errors'
import type { PlanStore } from '../plan-store'
import type { Database } from './client'
import {
  cloudOperationAuthoritySql,
  cloudOperationGuardFailure,
  cloudOperationLimitSql,
  cloudOperationMonthSql,
} from './cloud-operations'
import { workspacePlan } from './schema'

/** Missing or malformed authority is an error, never a permissive quota fallback. */
export function createDrizzlePlanStore(db: Database): PlanStore {
  return {
    async spendOperations(input) {
      const parsed = cloudOperationSpendSchema.safeParse(input)
      if (!parsed.success) throw apiErrors.validation('Invalid cloud operation admission.')
      const authority = cloudOperationAuthoritySql(parsed.data)
      const month = cloudOperationMonthSql
      const used = sql`CASE WHEN operation_month < ${month} THEN 0 ELSE operation_units END`
      try {
        const admitted = await db.all<{ units: number }>(sql`
          UPDATE workspace_plan
                    SET operation_month = ${month}, operation_units = ${used} + ${input.units}
                    WHERE organization_id = ${input.organizationId} AND ${authority}
                      AND operation_month <= ${month} AND ${used} + ${input.units} <= ${cloudOperationLimitSql}
                    RETURNING operation_units AS units
        `)
        if (admitted.length === 1) return
      } catch (error) {
        const failure = cloudOperationGuardFailure(error)
        if (failure === 'authority') throw apiErrors.retryLater()
        if (failure !== 'quota') throw error
        throw allowanceExhausted()
      }
      const [state] = await db.all<{
        authorized: number
        month: number
        current: number
        allowance: number | null
      }>(sql`
        SELECT ${authority} AS authorized, operation_month AS month, ${month} AS current,
          ${cloudOperationLimitSql} AS allowance FROM workspace_plan WHERE organization_id = ${input.organizationId}
      `)
      if (state?.authorized !== 1) {
        if (input.kind === 'share') throw apiErrors.notFound()
        throw apiErrors.forbidden()
      }
      if (state.month > state.current || state.allowance === null) throw apiErrors.retryLater()
      throw allowanceExhausted()
    },
    async get(organizationId) {
      const [record] = await db
        .select({
          organizationId: workspacePlan.organizationId,
          kind: workspacePlan.kind,
          basePlan: workspacePlan.basePlan,
          baseMemberLimit: workspacePlan.baseMemberLimit,
          retainedMemberLimit: workspacePlan.retainedMemberLimit,
          paidPlan: workspacePlan.paidPlan,
          paidThrough: workspacePlan.paidThrough,
          paidAccessSuspended: workspacePlan.paidAccessSuspended,
          revision: workspacePlan.revision,
        })
        .from(workspacePlan)
        .where(eq(workspacePlan.organizationId, organizationId))
      if (record === undefined) throw apiErrors.forbidden()
      return workspacePlanRecordSchema.parse(record)
    },
  }
}

function allowanceExhausted() {
  const now = new Date()
  const reset = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
  return apiErrors.rateLimited(Math.ceil((reset - now.getTime()) / MILLISECONDS_PER_SECOND))
}
