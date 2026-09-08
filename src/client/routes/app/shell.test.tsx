import { screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HTTP_STATUS } from '../../../shared/constants'
import {
  makeMember,
  makeOrganization,
  OWNER,
  seedOwnerWorkspace,
} from '../../test-support/fake-auth-client'
import { fakeAuth, installFakeAuth } from '../../test-support/fake-auth-module'
import { renderApp } from '../../test-support/render-app'

vi.mock('../../lib/auth-client', () => import('../../test-support/fake-auth-module'))

const client = fakeAuth
/** Dashboard, Library, Editor, Bulk, Video, Documents, Gallery, Shares, Members, Audit log. */
const NAV_ITEM_COUNT = 10

beforeEach(() => {
  installFakeAuth()
  window.localStorage.clear()
  delete document.documentElement.dataset['theme']
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('application shell', () => {
  it('signs out from the account menu', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    const { router } = renderApp('/app')
    await screen.findByRole('heading', { level: 1 })
    await user.click(screen.getByRole('button', { name: `Account menu for ${OWNER.name}` }))
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(client().signOut).toHaveBeenCalledOnce()
  })

  it('switches organizations and offers to create a new one', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    const second = makeOrganization('org-2', 'Side Project', 'side-project')
    second.members.push(makeMember(second.id, OWNER, 'owner'))
    client().state.organizations.push(second)

    const { router } = renderApp('/app/members')
    await screen.findByRole('heading', { level: 1 })
    await user.click(
      screen.getByRole('button', { name: 'Organization: Acme Studio. Switch organization' }),
    )
    await user.click(await screen.findByRole('menuitem', { name: 'Side Project' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/app'))
    expect(client().organization.setActive).toHaveBeenCalledWith({ organizationId: 'org-2' })

    await user.click(
      await screen.findByRole('button', {
        name: 'Organization: Side Project. Switch organization',
      }),
    )
    await user.click(await screen.findByRole('menuitem', { name: 'New organization' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/app/organizations/new'))
  })

  it('cycles the theme from the header toggle and remembers it', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    )
    seedOwnerWorkspace(client())
    renderApp('/app')
    await screen.findByRole('heading', { level: 1 })
    await user.click(screen.getByRole('button', { name: /Theme: follows system/ }))
    expect(document.documentElement.dataset['theme']).toBe('light')
    await user.click(screen.getByRole('button', { name: /Theme: light/ }))
    expect(document.documentElement.dataset['theme']).toBe('dark')
    expect(window.localStorage.getItem('watermark-pro.theme')).toBe('dark')
    await user.click(screen.getByRole('button', { name: /Theme: dark/ }))
    expect(window.localStorage.getItem('watermark-pro.theme')).toBe('system')
  })

  it('offers the phone tab bar and a menu sheet with the remaining destinations', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    const { router } = renderApp('/app')
    await screen.findByRole('heading', { level: 1 })
    const tabBar = screen.getByRole('navigation', { name: 'Tools' })
    expect(
      within(tabBar)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Library', 'Editor', 'Bulk', 'Gallery'])
    expect(screen.queryByRole('dialog')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Menu' }))
    const sheet = await screen.findByRole('dialog', { name: 'Menu' })
    expect(
      within(sheet).getByRole('button', { name: 'Organization: Acme Studio. Switch organization' }),
    ).toBeInTheDocument()
    const menuNav = within(sheet).getByRole('navigation', { name: 'Primary (menu)' })
    expect(within(menuNav).getAllByRole('link')).toHaveLength(NAV_ITEM_COUNT)
    expect(within(menuNav).queryByRole('link', { name: 'Admin' })).toBeNull()
    await user.click(within(menuNav).getByRole('link', { name: 'Members' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/app/members'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await user.click(screen.getByRole('button', { name: 'Menu' }))
    await screen.findByRole('dialog', { name: 'Menu' })
    await user.click(screen.getByRole('button', { name: 'Close menu' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('shows the layout error boundary when the organization cannot be loaded', async () => {
    seedOwnerWorkspace(client())
    client().organization.getFullOrganization.mockImplementation(() =>
      Promise.resolve({
        data: null,
        error: {
          message: 'Database unavailable',
          code: 'INTERNAL',
          status: HTTP_STATUS.internalServerError,
        },
      }),
    )
    renderApp('/app')
    expect(await screen.findByRole('alert')).toHaveTextContent('Database unavailable')
  })
})
