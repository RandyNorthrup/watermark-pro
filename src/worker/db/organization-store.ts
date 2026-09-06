import { count, desc, eq } from 'drizzle-orm'

import { ADMIN_ORGANIZATION_PAGE_SIZE } from '../../shared/constants'
import type { OrganizationStore } from '../stores'
import type { Database } from './client'
import { member, organization } from './schema'

/** D1-backed tenant overview for the platform admin console. */
export function createDrizzleOrganizationStore(db: Database): OrganizationStore {
  return {
    async listSummaries() {
      const rows = await db
        .select({
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          createdAt: organization.createdAt,
          memberCount: count(member.id),
        })
        .from(organization)
        .leftJoin(member, eq(member.organizationId, organization.id))
        .groupBy(organization.id)
        .orderBy(desc(organization.createdAt))
        .limit(ADMIN_ORGANIZATION_PAGE_SIZE)
      return rows
    },
  }
}
