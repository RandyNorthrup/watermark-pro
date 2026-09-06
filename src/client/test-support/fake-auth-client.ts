/**
 * In-memory stand-in for the Better Auth browser client. Tests install it
 * with `vi.mock('../lib/auth-client')` and drive scenarios by mutating
 * `state`. Every method mirrors the `{ data, error }` result shape of the
 * real client so page code runs unchanged.
 */
import { vi } from 'vitest'

import type { OrganizationRole } from '../../shared/permissions'

export interface FakeUser {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image: string | null
}

export interface FakeMember {
  id: string
  organizationId: string
  userId: string
  role: OrganizationRole
  createdAt: Date
  user: { id: string; name: string; email: string; image?: string | undefined }
}

export interface FakeInvitation {
  id: string
  organizationId: string
  email: string
  role: OrganizationRole
  status: 'pending' | 'accepted' | 'rejected' | 'canceled'
  expiresAt: Date
  inviterId: string
}

export interface FakeOrganization {
  id: string
  name: string
  slug: string
  logo: string | null
  createdAt: Date
  metadata: null
  members: FakeMember[]
  invitations: FakeInvitation[]
}

export interface FakeAuthState {
  user: FakeUser | null
  activeOrganizationId: string | null
  organizations: FakeOrganization[]
  /** Error to return from the next sign-in attempt, if any. */
  nextSignInError: { code: string; message: string } | null
}

type Result<T> = Promise<{
  data: T | null
  error: { message: string; code: string; status: number } | null
}>

/** Clones like a real network response would, so in-place state mutations become new objects. */
function ok<T>(data: T): Result<T> {
  return Promise.resolve({ data: structuredClone(data), error: null })
}

function fail<T>(message: string, code = 'FAILED', status = 400): Result<T> {
  return Promise.resolve({ data: null, error: { message, code, status } })
}

export function createFakeAuthClient() {
  const state: FakeAuthState = {
    user: null,
    activeOrganizationId: null,
    organizations: [],
    nextSignInError: null,
  }

  const activeOrganization = () =>
    state.organizations.find((organization) => organization.id === state.activeOrganizationId) ??
    null

  const session = () =>
    state.user === null
      ? null
      : {
          user: state.user,
          session: {
            id: 'session-1',
            userId: state.user.id,
            activeOrganizationId: state.activeOrganizationId,
          },
        }

  const client = {
    state,
    getSession: vi.fn(() => ok(session())),
    signOut: vi.fn(() => {
      state.user = null
      return ok({ success: true })
    }),
    signIn: {
      email: vi.fn((input: { email: string; password: string }) => {
        if (state.nextSignInError !== null) {
          const error = state.nextSignInError
          state.nextSignInError = null
          return fail(error.message, error.code, 403)
        }
        state.user = {
          id: 'user-1',
          name: 'Olivia Owner',
          email: input.email,
          emailVerified: true,
          image: null,
        }
        return ok({ user: state.user })
      }),
    },
    signUp: {
      email: vi.fn((input: { name: string; email: string; password: string }) =>
        input.email.endsWith('@taken.test')
          ? fail('User already exists', 'USER_ALREADY_EXISTS', 422)
          : ok({ user: { id: 'user-new', name: input.name, email: input.email } }),
      ),
    },
    sendVerificationEmail: vi.fn(() => ok({ status: true })),
    requestPasswordReset: vi.fn(() => ok({ status: true })),
    resetPassword: vi.fn((input: { token: string }) =>
      input.token === 'expired' ? fail('Invalid token', 'INVALID_TOKEN') : ok({ status: true }),
    ),
    organization: {
      list: vi.fn(() =>
        ok(
          state.organizations.map(({ id, name, slug, logo, createdAt }) => ({
            id,
            name,
            slug,
            logo,
            createdAt,
          })),
        ),
      ),
      getFullOrganization: vi.fn(() => ok(activeOrganization())),
      getActiveMemberRole: vi.fn(() => {
        const organization = activeOrganization()
        const member = organization?.members.find(
          (candidate) => candidate.userId === state.user?.id,
        )
        return member === undefined
          ? fail('No active organization', 'NO_ACTIVE_ORGANIZATION')
          : ok({ role: member.role })
      }),
      setActive: vi.fn((input: { organizationId: string }) => {
        state.activeOrganizationId = input.organizationId
        return ok(activeOrganization())
      }),
      create: vi.fn((input: { name: string; slug: string }) => {
        if (input.slug === 'taken') {
          return fail('Organization slug is taken', 'ORGANIZATION_SLUG_TAKEN')
        }
        const organization = makeOrganization(
          `org-${String(state.organizations.length + 1)}`,
          input.name,
          input.slug,
        )
        if (state.user !== null) {
          organization.members.push(makeMember(organization.id, state.user, 'owner'))
        }
        state.organizations.push(organization)
        return ok(organization)
      }),
      inviteMember: vi.fn(
        (input: { email: string; role: OrganizationRole; organizationId: string }) => {
          const organization = state.organizations.find(
            (candidate) => candidate.id === input.organizationId,
          )
          if (organization === undefined) {
            return fail('Organization not found', 'ORGANIZATION_NOT_FOUND', 404)
          }
          const invitation: FakeInvitation = {
            id: `inv-${String(organization.invitations.length + 1)}`,
            organizationId: organization.id,
            email: input.email,
            role: input.role,
            status: 'pending',
            expiresAt: new Date(Date.now() + 1_000_000),
            inviterId: state.user?.id ?? 'unknown',
          }
          organization.invitations.push(invitation)
          return ok(invitation)
        },
      ),
      getInvitation: vi.fn((input: { query: { id: string } }) => {
        for (const organization of state.organizations) {
          const invitation = organization.invitations.find(
            (candidate) => candidate.id === input.query.id,
          )
          if (invitation !== undefined) {
            return ok({
              ...invitation,
              organizationName: organization.name,
              organizationSlug: organization.slug,
              inviterEmail: 'olivia@example.test',
            })
          }
        }
        return fail('Invitation not found', 'INVITATION_NOT_FOUND', 404)
      }),
      acceptInvitation: vi.fn((input: { invitationId: string }) => {
        for (const organization of state.organizations) {
          const invitation = organization.invitations.find(
            (candidate) => candidate.id === input.invitationId,
          )
          if (invitation !== undefined && state.user !== null) {
            invitation.status = 'accepted'
            const member = makeMember(organization.id, state.user, invitation.role)
            organization.members.push(member)
            return ok({ invitation, member })
          }
        }
        return fail('Invitation not found', 'INVITATION_NOT_FOUND', 404)
      }),
      rejectInvitation: vi.fn(() => ok({ invitation: null, member: null })),
      updateMemberRole: vi.fn((input: { memberId: string; role: OrganizationRole }) => {
        for (const organization of state.organizations) {
          const member = organization.members.find((candidate) => candidate.id === input.memberId)
          if (member !== undefined) {
            member.role = input.role
            return ok(member)
          }
        }
        return fail('Member not found', 'MEMBER_NOT_FOUND', 404)
      }),
      removeMember: vi.fn((input: { memberIdOrEmail: string }) => {
        for (const organization of state.organizations) {
          const index = organization.members.findIndex(
            (candidate) => candidate.id === input.memberIdOrEmail,
          )
          if (index !== -1) {
            const [removed] = organization.members.splice(index, 1)
            return ok({ member: removed })
          }
        }
        return fail('Member not found', 'MEMBER_NOT_FOUND', 404)
      }),
      cancelInvitation: vi.fn((input: { invitationId: string }) => {
        for (const organization of state.organizations) {
          const invitation = organization.invitations.find(
            (candidate) => candidate.id === input.invitationId,
          )
          if (invitation !== undefined) {
            invitation.status = 'canceled'
            return ok(invitation)
          }
        }
        return fail('Invitation not found', 'INVITATION_NOT_FOUND', 404)
      }),
    },
  }

  return client
}

export function makeOrganization(id: string, name: string, slug: string): FakeOrganization {
  return {
    id,
    name,
    slug,
    logo: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    metadata: null,
    members: [],
    invitations: [],
  }
}

export function makeMember(
  organizationId: string,
  user: FakeUser,
  role: OrganizationRole,
): FakeMember {
  return {
    id: `member-${user.id}-${organizationId}`,
    organizationId,
    userId: user.id,
    role,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    user: { id: user.id, name: user.name, email: user.email, image: user.image ?? undefined },
  }
}

export const OWNER: FakeUser = {
  id: 'user-1',
  name: 'Olivia Owner',
  email: 'olivia@example.test',
  emailVerified: true,
  image: null,
}

export const VIEWER: FakeUser = {
  id: 'user-2',
  name: 'Vic Viewer',
  email: 'vic@example.test',
  emailVerified: true,
  image: null,
}

/** A signed-in owner with one organization that also has a viewer and a pending invitation. */
export function seedOwnerWorkspace(
  client: ReturnType<typeof createFakeAuthClient>,
): FakeOrganization {
  const organization = makeOrganization('org-1', 'Acme Studio', 'acme-studio')
  organization.members.push(
    makeMember(organization.id, OWNER, 'owner'),
    makeMember(organization.id, VIEWER, 'viewer'),
  )
  organization.invitations.push({
    id: 'inv-1',
    organizationId: organization.id,
    email: 'pending@example.test',
    role: 'editor',
    status: 'pending',
    expiresAt: new Date('2026-12-01T00:00:00Z'),
    inviterId: OWNER.id,
  })
  client.state.user = OWNER
  client.state.organizations = [organization]
  client.state.activeOrganizationId = organization.id
  return organization
}
