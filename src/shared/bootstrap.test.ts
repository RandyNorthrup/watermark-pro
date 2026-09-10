import { describe, expect, it } from 'vitest'

import {
  bootstrapRequestSchema,
  bootstrapSnapshotSchema,
  type BootstrapSnapshot,
} from './bootstrap'
import { bootstrapFixture } from './test-support/bootstrap-fixture'

describe('bootstrap snapshot contract', () => {
  it('accepts linked display state and strips credentials, addresses and unrelated metadata', () => {
    const fixture = bootstrapFixture()
    const parsed = bootstrapSnapshotSchema.parse({
      ...fixture,
      session: {
        ...fixture.session,
        session: {
          ...fixture.session.session,
          token: 'PRIVATE_TOKEN',
          ipAddress: 'PRIVATE_IP',
          userAgent: 'PRIVATE_AGENT',
        },
      },
      organization: { ...fixture.organization, metadata: 'PRIVATE_METADATA' },
    })
    expect(parsed).toEqual(fixture)
    expect(JSON.stringify(parsed)).not.toContain('PRIVATE_')
    expect(bootstrapRequestSchema.safeParse({}).success).toBe(true)
    expect(bootstrapRequestSchema.safeParse({ userId: 'another-account' }).success).toBe(false)
  })
  const cases: [string, (snapshot: BootstrapSnapshot) => void][] = [
    [
      'unverified account',
      (s) => {
        s.session.user.emailVerified = false
      },
    ],
    [
      'invalid account id',
      (s) => {
        s.session.user.id = ''
      },
    ],
    [
      'mixed session',
      (s) => {
        s.session.session.userId = 'account-b'
      },
    ],
    [
      'mixed active workspace',
      (s) => {
        s.session.session.activeOrganizationId = 'foreign-org'
      },
    ],
    [
      'absent workspace list',
      (s) => {
        s.organizations = []
      },
    ],
    [
      'duplicate workspace',
      (s) => {
        s.organizations.push(...s.organizations)
      },
    ],
    [
      'unknown workspace id',
      (s) => {
        s.organizations[0] = { id: 'bad/id', name: 'bad', slug: 'bad', createdAt: new Date() }
      },
    ],
    [
      'absent organization',
      (s) => {
        s.organization = null
      },
    ],
    [
      'absent role',
      (s) => {
        s.role = null
      },
    ],
    [
      'mixed role',
      (s) => {
        s.role = { role: 'viewer' }
      },
    ],
    [
      'missing membership',
      (s) => {
        if (s.organization !== null) s.organization.members = []
      },
    ],
    [
      'foreign member row',
      (s) => {
        if (s.organization?.members[0] !== undefined)
          s.organization.members[0].organizationId = 'foreign-org'
      },
    ],
    [
      'mixed member user',
      (s) => {
        if (s.organization?.members[0] !== undefined)
          s.organization.members[0].user.id = 'foreign-user'
      },
    ],
    [
      'foreign invitation',
      (s) => {
        s.organization?.invitations.push({
          id: 'invite',
          organizationId: 'foreign-org',
          email: 'private@example.test',
          status: 'pending',
          expiresAt: new Date(),
          inviterId: 'foreign-user',
        })
      },
    ],
    [
      'false recovery state',
      (s) => {
        s.selectionRequired = true
      },
    ],
  ]
  it.each(cases)('rejects %s', (_name, mutate) => {
    const snapshot = bootstrapFixture()
    mutate(snapshot)
    expect(bootstrapSnapshotSchema.safeParse(snapshot).success).toBe(false)
  })
  it('allows explicit selection recovery only without active workspace data or a role', () => {
    const fixture = bootstrapFixture()
    fixture.session.session.activeOrganizationId = null
    fixture.organization = null
    fixture.role = null
    fixture.selectionRequired = true
    expect(bootstrapSnapshotSchema.parse(fixture)).toEqual(fixture)
    expect(bootstrapSnapshotSchema.safeParse({ ...fixture, organizations: [] }).success).toBe(false)
  })
})
