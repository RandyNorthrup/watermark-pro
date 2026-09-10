import { screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { OWNER, seedOwnerWorkspace, VIEWER } from '../../test-support/fake-auth-client'
import { fakeAuth, installFakeAuth } from '../../test-support/fake-auth-module'
import { installLibraryApi } from '../../test-support/fake-library-api'
import { renderApp } from '../../test-support/render-app'
import { requestUrl } from '../../test-support/request-url'

vi.mock('../../lib/auth-client', () => import('../../test-support/fake-auth-module'))

beforeEach(() => {
  installFakeAuth()
  seedOwnerWorkspace(fakeAuth())
  installLibraryApi()
  const original = globalThis.fetch
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      requestUrl(input) === '/api/admin/account-stats'
        ? Promise.resolve(
            Response.json({
              users: 3,
              verifiedUsers: 3,
              pendingInvitations: 0,
              acceptedInvitations: 0,
            }),
          )
        : original(input, init),
    ),
  )
})
afterEach(() => vi.unstubAllGlobals())

function seedManager(role: 'owner' | 'admin') {
  const client = fakeAuth()
  const actor = { ...OWNER, role }
  const protectedOwner =
    role === 'owner'
      ? actor
      : {
          ...OWNER,
          id: 'site-owner',
          name: 'Protected Owner',
          email: 'site-owner@example.test',
          role: 'owner' as const,
        }
  client.state.user = actor
  client.state.allUsers = [
    protectedOwner,
    ...(role === 'owner' ? [] : [actor]),
    { ...VIEWER, role: 'user' },
  ]
  return { client, protectedOwner }
}

describe('site management roles', () => {
  it.each(['owner', 'admin'] as const)(
    'lets the site %s promote and demote a non-owner account',
    async (role) => {
      const { client } = seedManager(role)
      const user = userEvent.setup()
      renderApp('/app/admin')
      const control = await screen.findByRole('combobox', { name: `Site role for ${VIEWER.email}` })
      expect(control).toHaveValue('user')
      expect(within(control).queryByRole('option', { name: 'Owner' })).not.toBeInTheDocument()
      await user.selectOptions(control, 'admin')
      await waitFor(() =>
        expect(client.admin.setRole).toHaveBeenLastCalledWith({ userId: VIEWER.id, role: 'admin' }),
      )
      await waitFor(() => expect(control).toHaveValue('admin'))
      await user.selectOptions(control, 'user')
      await waitFor(() =>
        expect(client.admin.setRole).toHaveBeenLastCalledWith({ userId: VIEWER.id, role: 'user' }),
      )
      await waitFor(() => expect(control).toHaveValue('user'))
    },
  )
  it('shows the owner as protected and offers no owner-target mutations to an admin', async () => {
    const { protectedOwner } = seedManager('admin')
    renderApp('/app/admin')
    const email = await screen.findByText(protectedOwner.email)
    const row = email.closest('li')
    if (row === null) throw new Error('The site owner row was not rendered')
    expect(within(row).queryByRole('button')).not.toBeInTheDocument()
    expect(within(row).queryByRole('combobox')).not.toBeInTheDocument()
    expect(within(row).getByText('Site role: Owner')).toBeInTheDocument()
    expect(within(row).getByText('The owner account is protected.')).toBeInTheDocument()
  })
  it('leaves site administration after an admin demotes their own account', async () => {
    const { client } = seedManager('admin')
    const user = userEvent.setup()
    const { router } = renderApp('/app/admin')
    const control = await screen.findByRole('combobox', { name: `Site role for ${OWNER.email}` })
    await user.selectOptions(control, 'user')
    await waitFor(() => expect(client.state.user?.role).toBe('user'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/app'))
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Acme Studio')
    expect(screen.getByRole('heading', { name: 'Recent work' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Users' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
  })
  it('keeps the authoritative role and reports a rejected role change', async () => {
    const { client } = seedManager('admin')
    client.admin.setRole.mockImplementationOnce(() => {
      throw new Error('Role update rejected')
    })
    const user = userEvent.setup()
    renderApp('/app/admin')
    const control = await screen.findByRole('combobox', { name: `Site role for ${VIEWER.email}` })
    await user.selectOptions(control, 'admin')
    expect(await screen.findByText('Role update rejected')).toBeInTheDocument()
    expect(control).toHaveValue('user')
    expect(client.state.allUsers.find((person) => person.id === VIEWER.id)?.role).toBe('user')
  })
})
