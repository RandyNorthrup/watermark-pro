import type { BootstrapSnapshot } from '../bootstrap'

/** Display-only fixture for the bootstrap wire contract; server authorization tests use real accounts. */
export function bootstrapFixture(userId = 'account-a'): BootstrapSnapshot {
  const organizationId = `personal-${userId}`
  const createdAt = new Date('2026-01-01T00:00:00.000Z')
  const organization = {
    id: organizationId,
    name: `${userId} workspace`,
    slug: organizationId,
    createdAt,
  }
  return {
    session: {
      user: {
        id: userId,
        name: `${userId} name`,
        email: `${userId}@example.test`,
        emailVerified: true,
      },
      session: { id: `session-${userId}`, userId, activeOrganizationId: organizationId },
    },
    organizations: [organization],
    organization: {
      ...organization,
      members: [
        {
          id: `member-${userId}`,
          organizationId,
          userId,
          role: 'owner',
          createdAt,
          user: { id: userId, name: `${userId} name`, email: `${userId}@example.test` },
        },
      ],
      invitations: [],
    },
    role: { role: 'owner' },
    selectionRequired: false,
  }
}
