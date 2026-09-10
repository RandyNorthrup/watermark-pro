/** Page fixtures model the bootstrap response while transport and server suites exercise the real boundaries. */
import { makeMember, makeOrganization } from './fake-auth-client'
import { fakeAuth } from './fake-auth-module'
import { BOOTSTRAP_PATH, bootstrapSnapshotSchema } from '../../shared/bootstrap'
import { ApiRequestError } from '../lib/api'

function valueOf<T>(result: {
  data: T | null
  error: { status: number; message: string } | null
}): T {
  if (result.error !== null)
    throw new ApiRequestError(BOOTSTRAP_PATH, result.error.status, result.error.message)
  if (result.data === null) throw new ApiRequestError(BOOTSTRAP_PATH, 401)
  return result.data
}

/** Keep existing fake-session failure controls usable in whole-page workflow tests. */
export async function fetchBootstrapSnapshot() {
  const client = fakeAuth()
  const session = valueOf(await client.getSession())
  const user = client.state.user
  if (user === null) throw new ApiRequestError(BOOTSTRAP_PATH, 401)
  if (!session.user.emailVerified) throw new ApiRequestError(BOOTSTRAP_PATH, 403)
  const personalId = `personal-${session.user.id}`
  if (client.state.organizations.every((organization) => organization.id !== personalId)) {
    const personal = makeOrganization(personalId, 'My workspace', personalId)
    personal.members = [makeMember(personalId, user, 'owner')]
    client.state.organizations.push(personal)
  }
  const organizations = valueOf(await client.organization.list()).filter((organization) =>
    client.state.organizations.some(
      (candidate) =>
        candidate.id === organization.id &&
        candidate.members.some((member) => member.userId === session.user.id),
    ),
  )
  const selected = session.session.activeOrganizationId
  if (selected !== null && organizations.every((organization) => organization.id !== selected)) {
    const cleared = await client.organization.setActive({ organizationId: null })
    if (cleared.error !== null)
      throw new ApiRequestError(BOOTSTRAP_PATH, cleared.error.status, cleared.error.message)
    return bootstrapSnapshotSchema.parse({
      session: { ...session, session: { ...session.session, activeOrganizationId: null } },
      organizations,
      organization: null,
      role: null,
      selectionRequired: true,
    })
  }
  if (selected === null)
    valueOf(await client.organization.setActive({ organizationId: personalId }))
  const organization = valueOf(await client.organization.getFullOrganization())
  const role = valueOf(await client.organization.getActiveMemberRole())
  return bootstrapSnapshotSchema.parse({
    session: { ...session, session: { ...session.session, activeOrganizationId: organization.id } },
    organizations,
    organization,
    role,
    selectionRequired: false,
  })
}
