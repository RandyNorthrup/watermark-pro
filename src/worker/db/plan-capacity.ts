import { sql, type SQL, type SQLWrapper } from 'drizzle-orm'

import { workspacePlan } from './schema'
import { PRIVATE_PLAN_CAPACITY, PUBLIC_PLANS, type WorkspaceCapacity } from '../../shared/plans'

/** Resolve live capacity inside the same D1 statement that admits a write; missing authority returns NULL. */
export function workspaceCapacitySql(
  organizationId: string | SQLWrapper,
  field: keyof WorkspaceCapacity,
  now: number,
): SQL {
  const privateLimit =
    field === 'members'
      ? sql`MAX(${workspacePlan.baseMemberLimit}, ${workspacePlan.retainedMemberLimit}, ${PRIVATE_PLAN_CAPACITY.sharedMembers})`
      : PRIVATE_PLAN_CAPACITY[field]
  const freeLimit =
    field === 'members'
      ? sql`MAX(${PUBLIC_PLANS.free.members}, ${workspacePlan.retainedMemberLimit})`
      : PUBLIC_PLANS.free[field]
  const paidProLimit =
    field === 'members'
      ? sql`MAX(${PUBLIC_PLANS.pro.members}, CASE WHEN ${workspacePlan.basePlan} = 'free' THEN ${freeLimit} ELSE ${privateLimit} END)`
      : PUBLIC_PLANS.pro[field]
  const paidTeamLimit =
    field === 'members'
      ? sql`MAX(${PUBLIC_PLANS.team.members}, CASE WHEN ${workspacePlan.basePlan} = 'free' THEN ${freeLimit} ELSE ${privateLimit} END)`
      : PUBLIC_PLANS.team[field]
  return sql`
    (
        SELECT CASE
          WHEN ${workspacePlan.paidAccessSuspended} = 0 AND ${workspacePlan.paidThrough} > ${now}
            THEN CASE ${workspacePlan.paidPlan}
              WHEN 'pro' THEN ${paidProLimit}
              WHEN 'team' THEN ${paidTeamLimit}
              ELSE CASE WHEN ${workspacePlan.basePlan} = 'free' THEN ${freeLimit} ELSE ${privateLimit} END
            END
          WHEN ${workspacePlan.basePlan} = 'free' THEN ${freeLimit}
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

/** Match the live limit inside member insertion; a missing plan cannot admit a new member. */
export function workspaceSeatAvailableSql(organizationId: string | SQLWrapper): SQL {
  return sql`
    (SELECT COUNT(*) FROM member WHERE organization_id = ${organizationId})
        < ${workspaceCapacitySql(organizationId, 'members', Date.now())}
  `
}
