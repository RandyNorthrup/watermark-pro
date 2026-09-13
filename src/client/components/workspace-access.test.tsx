import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WorkspaceAccess } from './workspace-access'
import { WorkspaceAccessDialog } from './workspace-access-dialog'
import { setOfflineUser } from '../lib/offline-context'
import { createQueryClient } from '../lib/query-client'
import {
  makeMember,
  makeOrganization,
  OWNER,
  seedOwnerWorkspace,
  VIEWER,
} from '../test-support/fake-auth-client'
import { fakeAuth, installFakeAuth } from '../test-support/fake-auth-module'
import { installLibraryApi } from '../test-support/fake-library-api'
import { pendingBackgroundQuery } from '../test-support/pending-background-query'
import { renderApp } from '../test-support/render-app'
import { requestUrl } from '../test-support/request-url'

vi.mock('../lib/auth-client', () => import('../test-support/fake-auth-module'))

beforeEach(() => {
  installFakeAuth()
  installLibraryApi()
  setOfflineUser(OWNER.id)
})

function renderAccess() {
  const organization = seedOwnerWorkspace(fakeAuth())
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <WorkspaceAccess organization={organization} userId={OWNER.id} isCompact />
    </QueryClientProvider>,
  )
}

describe('workspace access popout', () => {
  it('adds an existing user silently through the current workspace API', async () => {
    const user = userEvent.setup()
    renderAccess()
    fakeAuth().state.allUsers.push({ ...VIEWER, id: 'new-person', email: 'silent@example.test' })
    await screen.findByRole('heading', { name: 'People With Access' })
    await user.type(screen.getByLabelText('Add People'), 'silent@example.test')
    await user.click(screen.getByRole('switch', { name: 'Notify By Email' }))
    await user.click(screen.getByRole('button', { name: 'Add Person' }))
    expect(await screen.findByText('Access added without notification.')).toBeInTheDocument()
    expect(await screen.findByText('silent@example.test')).toBeInTheDocument()
    expect(fakeAuth().organization.inviteMember).not.toHaveBeenCalled()
  })

  it('creates, copies, and revokes an expiring link, keeping only View and Edit choices', async () => {
    const user = userEvent.setup()
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    renderAccess()
    await screen.findByRole('heading', { name: 'People With Access' })
    await user.click(screen.getByRole('combobox', { name: 'Link Permission' }))
    expect(screen.queryByRole('option', { name: 'Admin' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: 'Edit' }))
    await user.click(screen.getByRole('combobox', { name: 'Link Expiration' }))
    await user.click(screen.getByRole('option', { name: '30 Days' }))
    await user.click(screen.getByRole('button', { name: 'Create Link' }))
    const input = await screen.findByRole('textbox', { name: 'Invitation Link' })
    expect(input.getAttribute('value')).toContain('/workspace-invitation/')
    await user.click(screen.getByRole('button', { name: 'Copy Link' }))
    expect(copy).toHaveBeenCalledWith(input.getAttribute('value'))
    expect(screen.getByRole('status')).toHaveTextContent('Link copied.')
    await user.click(screen.getByRole('button', { name: 'Revoke Invitation For Invitation Link' }))
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'Invitation Link' })).not.toBeInTheDocument(),
    )
  })

  it('rejects stale modal events before sending as a newly signed-in account', async () => {
    const user = userEvent.setup()
    renderAccess()
    await screen.findByRole('heading', { name: 'People With Access' })
    const requests = vi.mocked(fetch)
    requests.mockClear()
    setOfflineUser(VIEWER.id)
    await user.click(screen.getByRole('button', { name: 'Create Link' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The signed-in account changed.')
    expect(requests).not.toHaveBeenCalled()
  })

  it('contains focus in a responsive dialog and dismisses without navigating', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const organization = seedOwnerWorkspace(fakeAuth())
    render(
      <QueryClientProvider client={createQueryClient()}>
        <WorkspaceAccessDialog organization={organization} userId={OWNER.id} onClose={onClose} />
      </QueryClientProvider>,
    )
    expect(await screen.findByRole('dialog', { name: 'Manage Access' })).toBeInTheDocument()
    await screen.findByRole('heading', { name: 'People With Access' })
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('validates email locally and keeps server rejection visible', async () => {
    const user = userEvent.setup()
    const state = installLibraryApi()
    renderAccess()
    await screen.findByRole('heading', { name: 'People With Access' })
    await user.type(screen.getByLabelText('Add People'), 'bad-email')
    await user.click(screen.getByRole('button', { name: 'Send Invite' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email address')
    await user.clear(screen.getByLabelText('Add People'))
    await user.type(screen.getByLabelText('Add People'), 'valid@example.test')
    state.failWith = 'forbidden'
    await user.click(screen.getByRole('button', { name: 'Send Invite' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Your role does not allow this.')
  })
})

describe('workspace invitation page', () => {
  it('requires explicit acceptance before switching into the granted workspace', async () => {
    const user = userEvent.setup()
    const organization = makeOrganization('shared-invite', 'Shared Invitation', 'shared-invite')
    organization.members.push(makeMember(organization.id, OWNER, 'owner'))
    fakeAuth().state.user = VIEWER
    fakeAuth().state.organizations = [organization]
    setOfflineUser(VIEWER.id)
    const original = fetch
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
        const url = requestUrl(input)
        if (url.includes('/api/me/workspace-invitations/')) {
          if (init.method === 'POST') {
            organization.members.push(makeMember(organization.id, VIEWER, 'viewer'))
            return Promise.resolve(Response.json({ organizationId: organization.id }))
          }
          return Promise.resolve(
            Response.json({ workspaceName: organization.name, role: 'viewer', isMember: false }),
          )
        }
        return original(input, init)
      }),
    )
    const token = `${crypto.randomUUID()}${crypto.randomUUID()}`
    const { router, queryClient } = renderApp(`/workspace-invitation/${token}`)
    expect(
      await screen.findByRole('heading', { name: 'Join Shared Invitation' }),
    ).toBeInTheDocument()
    expect(organization.members).toHaveLength(1)
    const background = pendingBackgroundQuery(queryClient)
    try {
      await user.click(screen.getByRole('button', { name: 'Join Workspace' }))
      await waitFor(() => expect(router.state.location.pathname).toBe('/app/editor'))
      expect(background.isPending()).toBe(true)
      expect(fakeAuth().state.activeOrganizationId).toBe(organization.id)
      expect(organization.members.find((member) => member.userId === VIEWER.id)?.role).toBe(
        'viewer',
      )
    } finally {
      background.complete()
    }
  })
})
