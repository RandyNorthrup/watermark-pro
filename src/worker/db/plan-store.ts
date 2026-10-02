import { eq } from 'drizzle-orm'

import { workspacePlanRecordSchema } from '../../shared/plans'
import { apiErrors } from '../errors'
import type { PlanStore } from '../plan-store'
import type { Database } from './client'
import { workspacePlan } from './schema'

/** Missing or malformed authority is an error, never a permissive quota fallback. */
export function createDrizzlePlanStore(db: Database): PlanStore {
  return {
    async get(organizationId) {
      const [record] = await db
        .select()
        .from(workspacePlan)
        .where(eq(workspacePlan.organizationId, organizationId))
      if (record === undefined) throw apiErrors.forbidden()
      return workspacePlanRecordSchema.parse(record)
    },
  }
}
