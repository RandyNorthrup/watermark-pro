import { screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HTTP_STATUS } from '../../../shared/constants'
import { setOfflineUser } from '../../lib/offline-context'
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
import { pendingBackgroundQuery } from '../../test-support/pending-background-query'
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
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Image')
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
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Image')
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
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Image'),
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
        screen.getByRole('button', { name: 'Workspace: Acme Studio. Switch workspace' }),
      ).toBeInTheDocument()
    },
  )
})

describe('members page', () => {
  it('lets an owner invite, change roles, remove members and cancel older invitations', async () => {
    const user = userEvent.setup()
    const organization = seedOwnerWorkspace(client())
    const api = installLibraryApi()
    renderApp('/app/members')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Manage Access')
    await screen.findByRole('heading', { name: 'People With Access' })
    await user.type(screen.getByLabelText('Add People'), 'new@example.test')
    await user.click(screen.getByRole('button', { name: 'Send Invite' }))
    expect(await screen.findByText('Workspace invitation sent.')).toBeInTheDocument()
    expect(api.access.links.get(organization.id)?.[0]).toMatchObject({
      email: 'new@example.test',
      role: 'viewer',
      status: 'pending',
    })
    await user.click(screen.getByRole('combobox', { name: `Role for ${VIEWER.name}` }))
    await user.click(await screen.findByRole('option', { name: 'Edit' }))
    await waitFor(() =>
      expect(organization.members.find((member) => member.userId === VIEWER.id)?.role).toBe(
        'editor',
      ),
    )
    await user.click(screen.getByRole('button', { name: `Remove Access For ${VIEWER.name}` }))
    await waitFor(() => expect(screen.queryByText(VIEWER.email)).not.toBeInTheDocument())
    await user.click(
      screen.getByRole('button', { name: 'Cancel invitation for pending@example.test' }),
    )
    await waitFor(() => expect(screen.queryByText('pending@example.test')).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Revoke Invitation For new@example.test' }))
    await waitFor(() => expect(screen.queryByText('new@example.test')).not.toBeInTheDocument())
  })

  it('hides management controls from a viewer', async () => {
    seedViewerWorkspace(client())
    renderApp('/app/members')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Manage Access')
    await screen.findByRole('heading', { name: 'People With Access' })
    expect(screen.queryByRole('button', { name: 'Send Invite' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remove Access/ })).not.toBeInTheDocument()
    expect(screen.getByText('Only the workspace owner can change access.')).toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'People With Access' })).getByText(VIEWER.name),
    ).toBeInTheDocument()
    expect(screen.getByText('(you)')).toBeInTheDocument()
  })

  it('surfaces a failed role change inline without changing displayed permissions', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    const api = installLibraryApi()
    renderApp('/app/members')
    await screen.findByRole('heading', { name: 'People With Access' })
    const trigger = screen.getByRole('combobox', { name: `Role for ${VIEWER.name}` })
    expect(trigger).toHaveTextContent('View')
    await user.click(trigger)
    api.failWith = 'forbidden'
    await user.click(await screen.findByRole('option', { name: 'Edit' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Your role does not allow this.')
    expect(trigger).toHaveTextContent('View')
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

    const { router, queryClient } = renderApp('/accept-invitation/inv-9')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Join Acme Studio')
    const background = pendingBackgroundQuery(queryClient)
    try {
      await user.click(screen.getByRole('button', { name: 'Accept invitation' }))
      await waitFor(() => expect(router.state.location.pathname).toBe('/app/members'))
      expect(background.isPending()).toBe(true)
      expect(client().organization.acceptInvitation).toHaveBeenCalledWith({ invitationId: 'inv-9' })
    } finally {
      background.complete()
    }
  })

  it('shows a clear message for an unknown invitation', async () => {
    client().state.user = VIEWER
    renderApp('/accept-invitation/nope')
    expect(await screen.findByRole('alert')).toHaveTextContent('Invitation not found')
  })
})

describe('new organization', () => {
  it('opens the created workspace while an unrelated active query is still pending', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    const queryClient = createQueryClient()
    const { router } = renderApp('/app/organizations/new', queryClient)
    const name = await screen.findByLabelText('Name')
    const background = pendingBackgroundQuery(queryClient)
    try {
      expect(background.isPending()).toBe(true)
      await user.type(name, 'New Workspace')
      await user.click(screen.getByRole('button', { name: 'Create workspace' }))
      await waitFor(() => expect(router.state.location.pathname).toBe('/app/editor'))
      expect(background.isPending()).toBe(true)
      expect(
        screen.getByRole('button', { name: 'Workspace: New Workspace. Switch workspace' }),
      ).toBeInTheDocument()
    } finally {
      background.complete()
    }
  })

  it.each(['create', 'activate'] as const)(
    'keeps form values and permits retry after a %s transport failure',
    async (stage) => {
      const user = userEvent.setup()
      seedOwnerWorkspace(client())
      const { router } = renderApp('/app/organizations/new')
      await user.type(await screen.findByLabelText('Name'), 'Retained Workspace')
      const operation =
        stage === 'create' ? client().organization.create : client().organization.setActive
      operation.mockRejectedValueOnce(new Error('The connection was interrupted.'))
      await user.click(screen.getByRole('button', { name: 'Create workspace' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('The connection was interrupted.')
      expect(screen.getByLabelText('Name')).toHaveValue('Retained Workspace')
      expect(screen.getByLabelText('URL identifier')).toHaveValue('retained-workspace')
      expect(screen.getByRole('button', { name: 'Create workspace' })).toBeEnabled()
      expect(router.state.location.pathname).toBe('/app/organizations/new')
    },
  )

  it('reports a refused activation without routing to a successful workspace', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    const { router } = renderApp('/app/organizations/new')
    await user.type(await screen.findByLabelText('Name'), 'Activation Denied')
    client().organization.setActive.mockResolvedValueOnce({
      data: null,
      error: { message: 'Workspace activation refused.', code: 'FORBIDDEN', status: 403 },
    })
    await user.click(screen.getByRole('button', { name: 'Create workspace' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Workspace activation refused.')
    expect(router.state.location.pathname).toBe('/app/organizations/new')
    expect(screen.getByLabelText('Name')).toHaveValue('Activation Denied')
    expect(screen.getByRole('button', { name: 'Create workspace' })).toBeEnabled()
  })

  it.each(['create', 'activate'] as const)(
    'refuses later submission steps when the account changes during %s',
    async (stage) => {
      const user = userEvent.setup()
      seedOwnerWorkspace(client())
      const { router } = renderApp('/app/organizations/new')
      await user.type(await screen.findByLabelText('Name'), 'Previous Account Workspace')
      if (stage === 'create') {
        const original = client().organization.create.getMockImplementation()
        if (original === undefined) throw new Error('Missing create fixture')
        client().organization.create.mockImplementationOnce(async (input) => {
          const result = await original(input)
          setOfflineUser(VIEWER.id)
          return result
        })
      } else {
        const original = client().organization.setActive.getMockImplementation()
        if (original === undefined) throw new Error('Missing activation fixture')
        client().organization.setActive.mockImplementationOnce(async (input) => {
          const result = await original(input)
          setOfflineUser(VIEWER.id)
          return result
        })
      }
      await user.click(screen.getByRole('button', { name: 'Create workspace' }))
      expect(client().organization.setActive).toHaveBeenCalledTimes(stage === 'create' ? 0 : 1)
      expect(router.state.location.pathname).toBe('/app/organizations/new')
    },
  )

  it('derives the slug from the name and creates the organization', async () => {
    const user = userEvent.setup()
    client().state.user = OWNER
    const { router } = renderApp('/app/organizations/new')
    await user.type(await screen.findByLabelText('Name'), 'Northrup Photo')
    expect(screen.getByLabelText('URL identifier')).toHaveValue('northrup-photo')
    await user.click(screen.getByRole('button', { name: 'Create workspace' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/app/editor'))
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Image')
    expect(
      screen.getByRole('button', { name: 'Workspace: Northrup Photo. Switch workspace' }),
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
    await user.click(screen.getByRole('button', { name: 'Create workspace' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Organization slug is taken')
  })
})
