import type { MembershipCohort } from '../../shared/api-accounts'
import {
  PRIVATE_PLAN_CAPACITY,
  workspacePlanRecordSchema,
  type WorkspacePlanRecord,
} from '../../shared/plans'
import type { AccountStore } from '../account-store'
import { apiErrors } from '../errors'
import type { PlanStore } from '../plan-store'

interface PlanTables {
  user: { id?: string; membershipCohort?: MembershipCohort }[]
  organization: { id: string }[]
  member: { organizationId: string; userId: string; role: string }[]
}

/** Named fixtures share real Better Auth tables; real D1 tests certify the migration and atomic guards. */
export function createMemoryPlanStore(tables: PlanTables, accounts: AccountStore) {
  const records = new Map<string, WorkspacePlanRecord>()
  const store: PlanStore = {
    // Permission dispatch tests stub this boundary; only actual D1 tests fulfill monthly counters.
    spendOperations: () => Promise.resolve(),
    async get(organizationId) {
      const saved = records.get(organizationId)
      if (saved !== undefined) return structuredClone(saved)
      if (tables.organization.every((item) => item.id !== organizationId))
        throw apiErrors.forbidden()
      const owner = tables.member.find(
        (item) => item.organizationId === organizationId && item.role === 'owner',
      )
      if (owner === undefined) throw new Error('Workspace plan fixture has no owner.')
      const person = tables.user.find((item) => item.id === owner.userId)
      if (person === undefined) throw new Error('Workspace plan fixture has no owner identity.')
      const isPersonal = await accounts.isPrivateWorkspace(organizationId)
      const record = workspacePlanRecordSchema.parse({
        organizationId,
        kind: isPersonal ? 'personal' : 'shared',
        retainedMemberLimit: Math.max(
          1,
          tables.member.filter((item) => item.organizationId === organizationId).length,
        ),
        basePlan: person.membershipCohort === 'private' ? 'private' : 'free',
        baseMemberLimit:
          isPersonal || person.membershipCohort !== 'private'
            ? 1
            : PRIVATE_PLAN_CAPACITY.sharedMembers,
        paidPlan: null,
        paidThrough: null,
        paidAccessSuspended: false,
        revision: 0,
      })
      records.set(organizationId, record)
      return structuredClone(record)
    },
  }
  return {
    ...store,
    /** Explicit trusted-server records stand in for already verified subscription/migration fixtures. */
    seed(record: WorkspacePlanRecord) {
      records.set(record.organizationId, workspacePlanRecordSchema.parse(record))
    },
  }
}
