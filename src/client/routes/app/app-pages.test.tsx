import { screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HTTP_STATUS } from '../../../shared/constants'
import { activeOrganizationQueryOptions } from '../../lib/queries'
import { createQueryClient } from '../../lib/query-client'
import {
  makeMember,
  makeOrganization,
  OWNER,
  seedOwnerWorkspace,
  seedViewerWorkspace,
  VIEWER,
} from '../../test-support/fake-auth-client'
import { fakeAuth, installFakeAuth } from '../../test-support/fake-auth-module'
import { installLibraryApi } from '../../test-support/fake-library-api'
import { renderApp } from '../../test-support/render-app'
import { requestUrl } from '../../test-support/request-url'

vi.mock('../../lib/auth-client', () => import('../../test-support/fake-auth-module'))

const client = fakeAuth

const auditEntries = [
  {
    id: 'a1',
    organizationId: 'org-1',
    actorUserId: OWNER.id,
    actorName: OWNER.name,
    action: 'organization.created',
    targetType: 'organization',
    targetId: 'org-1',
    metadata: null,
    createdAt: '2026-09-05T10:00:00.000Z',
  },
  {
    id: 'a2',
    organizationId: 'org-1',
    actorUserId: OWNER.id,
    actorName: OWNER.name,
    action: 'invitation.created',
    targetType: 'invitation',
    targetId: 'inv-1',
    metadata: { email: 'pending@example.test', role: 'editor' },
    createdAt: '2026-09-05T11:00:00.000Z',
  },
]

function stubAuditApi(status: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input)
      if (!url.includes('/api/orgs/')) {
        return Promise.reject(new Error(`unexpected fetch ${url}`))
      }
      return Promise.resolve(
        status === HTTP_STATUS.ok
          ? Response.json({ entries: auditEntries })
          : Response.json({ error: 'forbidden' }, { status }),
      )
    }),
  )
}

beforeEach(() => {
  installFakeAuth()
  installLibraryApi()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('authenticated layout', () => {
  it('redirects visitors to sign in and remembers where they were going', async () => {
    const { router } = renderApp('/app/audit')
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(router.state.location.search).toEqual({ redirect: '/app/audit' })
  })

  it('automatically provisions an isolated workspace for a new account', async () => {
    client().state.user = OWNER
    const privateId = `personal-${OWNER.id}`
    installLibraryApi()
    const { router } = renderApp('/app')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Editor')
    expect(router.state.location.pathname).toBe('/app/editor')
    expect(screen.queryByRole('link', { name: /Dashboard|Overview/ })).not.toBeInTheDocument()
    expect(
      screen
        .getAllByRole('link', { name: 'Lumafoil' })
        .every((link) => link.getAttribute('href') === '/app/editor'),
    ).toBe(true)
    expect(client().state.organizations).toHaveLength(1)
    expect(client().state.activeOrganizationId).toBe(privateId)
  })

  it('defaults to the personal workspace when no collaboration is explicitly active', async () => {
    seedOwnerWorkspace(client())
    client().state.activeOrganizationId = null
    renderApp('/app')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Editor')
    expect(client().organization.setActive).toHaveBeenCalledWith({
      organizationId: `personal-${OWNER.id}`,
    })
    expect(client().state.organizations.map((organization) => organization.id)).toContain('org-1')
  })

  it('refetches a cached empty organization after a workspace becomes available', async () => {
    seedOwnerWorkspace(client())
    const queryClient = createQueryClient()
    queryClient.setQueryData(activeOrganizationQueryOptions.queryKey, null)
    renderApp('/app', queryClient)
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Editor'),
    )
    expect(screen.queryByRole('heading', { name: 'Your workspace' })).toBeNull()
  })

  it.each(['owner', 'admin'] as const)(
    'shows operational Overview only for a site %s',
    async (role) => {
      seedOwnerWorkspace(client())
      client().state.user = { ...OWNER, role }
      renderApp('/app')
      expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Overview')
      expect(screen.queryByRole('region', { name: 'Recent work' })).not.toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Tools' })).not.toBeInTheDocument()
      expect(
        within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('link', {
          name: 'Overview',
        }),
      ).toHaveAttribute('href', '/app')
      expect(screen.getByText('2')).toBeInTheDocument()
      expect(screen.getByText('1 pending invitation.')).toBeInTheDocument()
      expect(screen.getByText('owner')).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: `Account menu for ${OWNER.name}` }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Organization: Acme Studio. Switch organization' }),
      ).toBeInTheDocument()
    },
  )
})

describe('members page', () => {
  it('lets an owner invite, change roles, remove members and cancel invitations', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    renderApp('/app/members')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Members')
    expect(screen.getByRole('heading', { level: 2, name: '2 members' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('Email'), 'new@example.test')
    await user.click(screen.getByRole('button', { name: 'Send invitation' }))
    expect(await screen.findByText('Invitation sent to new@example.test.')).toBeInTheDocument()
    expect(client().organization.inviteMember).toHaveBeenCalledWith({
      email: 'new@example.test',
      role: 'editor',
      organizationId: 'org-1',
    })

    await user.click(screen.getByRole('button', { name: `Remove ${VIEWER.name}` }))
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 2, name: '1 member' })).toBeInTheDocument(),
    )

    await user.click(
      screen.getByRole('button', { name: 'Cancel invitation for pending@example.test' }),
    )
    await waitFor(() => expect(screen.queryByText('pending@example.test')).not.toBeInTheDocument())
  })

  it('hides management controls from a viewer', async () => {
    seedViewerWorkspace(client())

    renderApp('/app/members')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Members')
    expect(screen.queryByRole('button', { name: 'Send invitation' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument()
    const list = screen.getByRole('heading', { level: 2, name: '2 members' }).nextElementSibling
    expect(list).not.toBeNull()
    expect(within(list as HTMLElement).getByText('(you)')).toBeInTheDocument()
  })

  it('surfaces a failed role change inline', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    client().organization.updateMemberRole.mockImplementationOnce(() =>
      Promise.resolve({
        data: null,
        error: { message: 'Role is locked', code: 'LOCKED', status: 400 },
      }),
    )
    renderApp('/app/members')
    await screen.findByRole('heading', { level: 1 })
    const trigger = screen.getByRole('combobox', { name: `Role for ${VIEWER.name}` })
    expect(trigger).toHaveTextContent('Viewer')
    await user.click(trigger)
    await user.click(await screen.findByRole('option', { name: 'Admin' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Role is locked')
  })
})

describe('audit page', () => {
  it('renders the trail from the API', async () => {
    seedOwnerWorkspace(client())
    stubAuditApi(HTTP_STATUS.ok)
    renderApp('/app/audit')
    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(screen.getByText('organization.created')).toBeInTheDocument()
    expect(screen.getByText('email: pending@example.test · role: editor')).toBeInTheDocument()
  })

  it('explains a permission failure', async () => {
    seedOwnerWorkspace(client())
    stubAuditApi(HTTP_STATUS.forbidden)
    renderApp('/app/audit')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your role does not include audit access.',
    )
  })
})

describe('invitations', () => {
  it('lets a signed-in user accept an invitation and lands on the members page', async () => {
    const user = userEvent.setup()
    const organization = makeOrganization('org-1', 'Acme Studio', 'acme-studio')
    organization.members.push(makeMember(organization.id, OWNER, 'owner'))
    organization.invitations.push({
      id: 'inv-9',
      organizationId: organization.id,
      email: VIEWER.email,
      role: 'editor',
      status: 'pending',
      expiresAt: new Date('2026-12-01T00:00:00Z'),
      inviterId: OWNER.id,
    })
    client().state.user = VIEWER
    client().state.organizations = [organization]

    const { router } = renderApp('/accept-invitation/inv-9')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Join Acme Studio')
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/app/members'))
    expect(client().organization.acceptInvitation).toHaveBeenCalledWith({ invitationId: 'inv-9' })
  })

  it('shows a clear message for an unknown invitation', async () => {
    client().state.user = VIEWER
    renderApp('/accept-invitation/nope')
    expect(await screen.findByRole('alert')).toHaveTextContent('Invitation not found')
  })
})

describe('new organization', () => {
  it('derives the slug from the name and creates the organization', async () => {
    const user = userEvent.setup()
    client().state.user = OWNER
    const { router } = renderApp('/app/organizations/new')
    await user.type(await screen.findByLabelText('Name'), 'Northrup Photo')
    expect(screen.getByLabelText('URL identifier')).toHaveValue('northrup-photo')
    await user.click(screen.getByRole('button', { name: 'Create organization' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/app/editor'))
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Editor')
    expect(
      screen.getByRole('button', { name: 'Organization: Northrup Photo. Switch organization' }),
    ).toBeInTheDocument()
    expect(client().organization.create).toHaveBeenCalledWith({
      name: 'Northrup Photo',
      slug: 'northrup-photo',
    })
  })

  it('reports a taken slug', async () => {
    const user = userEvent.setup()
    client().state.user = OWNER
    renderApp('/app/organizations/new')
    await user.type(await screen.findByLabelText('Name'), 'Taken')
    await user.clear(screen.getByLabelText('URL identifier'))
    await user.type(screen.getByLabelText('URL identifier'), 'taken')
    await user.click(screen.getByRole('button', { name: 'Create organization' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Organization slug is taken')
  })
})
