import { makeMember } from './fake-auth-client'
import { fakeAuth } from './fake-auth-module'
import { ACCOUNT_ID_HEADER } from '../../shared/account-identity'
import {
  workspaceGrantRequestSchema,
  workspaceLinkRequestSchema,
  workspaceRoleRequestSchema,
  type WorkspaceLinkDto,
} from '../../shared/workspace-access'

export interface FakeWorkspaceAccessState {
  links: Map<string, WorkspaceLinkDto[]>
}

/** UI fixture only; real-auth and real-D1 tests independently verify permission enforcement. */
export function handleWorkspaceAccess(
  state: FakeWorkspaceAccessState,
  url: string,
  init: RequestInit,
): Response | null {
  const path = new URL(url, 'http://localhost').pathname
  const match = /^\/api\/orgs\/([^/]+)\/access(?:\/(members|links)(?:\/([^/]+))?)?$/.exec(path)
  if (match === null) return null
  const organizationId = match[1] ?? ''
  const organization = fakeAuth().state.organizations.find((entry) => entry.id === organizationId)
  const userId = new Headers(init.headers).get(ACCOUNT_ID_HEADER)
  const actor = organization?.members.find((entry) => entry.userId === userId)
  if (organization === undefined || actor === undefined)
    return Response.json({ error: 'forbidden' }, { status: 403 })
  const method = init.method ?? 'GET'
  const links = state.links.get(organizationId) ?? []
  if (method === 'GET')
    return Response.json({
      isOwner: actor.role === 'owner',
      members: organization.members.map((entry) => ({
        id: entry.id,
        userId: entry.userId,
        name: entry.user.name,
        email: entry.user.email,
        role: entry.role,
      })),
      links: actor.role === 'owner' ? links : [],
    })
  if (actor.role !== 'owner') return Response.json({ error: 'forbidden' }, { status: 403 })
  const body: unknown = JSON.parse(typeof init.body === 'string' ? init.body : '{}')
  const targetId = match[3]
  if (match[2] === 'members') {
    if (method === 'POST') {
      const input = workspaceGrantRequestSchema.parse(body)
      if (input.notify) {
        links.push({
          id: crypto.randomUUID(),
          email: input.email,
          role: input.role,
          status: 'pending',
          expiresAt: '2030-01-01T00:00:00.000Z',
        })
        state.links.set(organizationId, links)
      } else {
        const target = fakeAuth().state.allUsers.find((entry) => entry.email === input.email)
        if (target === undefined) return Response.json({ error: 'conflict' }, { status: 409 })
        organization.members.push(makeMember(organizationId, target, input.role))
      }
    } else {
      const member = organization.members.find((entry) => entry.id === targetId)
      if (member === undefined || member.role === 'owner')
        return Response.json({ error: 'forbidden' }, { status: 403 })
      if (method === 'DELETE')
        organization.members = organization.members.filter((entry) => entry.id !== targetId)
      else member.role = workspaceRoleRequestSchema.parse(body).role
    }
    return new Response(null, { status: 204 })
  }
  if (method === 'POST') {
    const input = workspaceLinkRequestSchema.parse(body)
    const link: WorkspaceLinkDto = {
      id: crypto.randomUUID(),
      email: null,
      role: input.role,
      status: 'pending',
      expiresAt: '2030-01-01T00:00:00.000Z',
    }
    links.push(link)
    state.links.set(organizationId, links)
    return Response.json(
      {
        link,
        url: `http://localhost:5273/workspace-invitation/${crypto.randomUUID()}${crypto.randomUUID()}`,
      },
      { status: 201 },
    )
  }
  const link = links.find((entry) => entry.id === targetId)
  if (link === undefined) return Response.json({ error: 'not_found' }, { status: 404 })
  link.status = 'revoked'
  return new Response(null, { status: 204 })
}
