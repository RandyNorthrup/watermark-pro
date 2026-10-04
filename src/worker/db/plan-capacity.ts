import { sql, type SQL } from 'drizzle-orm'

import { workspacePlan } from './schema'
import { PRIVATE_PLAN_CAPACITY, PUBLIC_PLANS, type WorkspaceCapacity } from '../../shared/plans'

/** Resolve live capacity inside the same D1 statement that admits a write; missing authority returns NULL. */
export function workspaceCapacitySql(
  organizationId: string,
  field: keyof WorkspaceCapacity,
  now: number,
): SQL {
  const privateLimit =
    field === 'members' ? workspacePlan.baseMemberLimit : PRIVATE_PLAN_CAPACITY[field]
  return sql`
    (
        SELECT CASE
          WHEN ${workspacePlan.paidAccessSuspended} = 0 AND ${workspacePlan.paidThrough} > ${now}
            THEN CASE ${workspacePlan.paidPlan}
              WHEN 'pro' THEN ${PUBLIC_PLANS.pro[field]}
              WHEN 'team' THEN ${PUBLIC_PLANS.team[field]}
              ELSE CASE WHEN ${workspacePlan.basePlan} = 'free' THEN ${PUBLIC_PLANS.free[field]} ELSE ${privateLimit} END
            END
          WHEN ${workspacePlan.basePlan} = 'free' THEN ${PUBLIC_PLANS.free[field]}
          WHEN ${workspacePlan.basePlan} IN ('private', 'legacy') THEN ${privateLimit}
          ELSE NULL
        END
        FROM ${workspacePlan}
        WHERE ${workspacePlan.organizationId} = ${organizationId}
          AND ${workspacePlan.kind} IN ('personal', 'shared')
          AND ${workspacePlan.basePlan} IN ('free', 'private', 'legacy')
          AND (${workspacePlan.kind} <> 'personal' OR ${workspacePlan.baseMemberLimit} = 1)
          AND (${workspacePlan.paidPlan} IS NULL
            OR (${workspacePlan.paidPlan} = 'pro' AND ${workspacePlan.kind} = 'personal')
            OR (${workspacePlan.paidPlan} = 'team' AND ${workspacePlan.kind} = 'shared'))
      )
  `
}
