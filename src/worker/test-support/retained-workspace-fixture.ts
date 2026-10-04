import type { Database } from '../db/client'
import { member, organization, user } from '../db/schema'

/** Model retained ownership after transfer without granting the current owner unlimited new creation. */
export async function createRetainedWorkspaceFixture(
  db: Database,
  ownerId: string,
  name: string,
  slugPrefix: string,
): Promise<string> {
  const creatorId = crypto.randomUUID()
  const organizationId = crypto.randomUUID()
  const now = new Date()
  await db.batch([
    db.insert(user).values({
      id: creatorId,
      name: 'Retained workspace creator',
      email: `${creatorId}@example.test`,
      emailVerified: true,
      membershipCohort: 'private',
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(organization).values({
      id: organizationId,
      name,
      slug: `${slugPrefix}-${organizationId}`,
      createdAt: now,
      creationOwnerId: creatorId,
    }),
    db.insert(member).values({
      id: crypto.randomUUID(),
      organizationId,
      userId: ownerId,
      role: 'owner',
      createdAt: now,
    }),
  ])
  return organizationId
}
