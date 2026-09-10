import { focusManager, onlineManager } from '@tanstack/react-query'
import { act, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HTTP_STATUS } from '../../../shared/constants'
import { shellOrganizationSchema } from '../../../shared/shell-cache'
import { activeOrganizationQueryOptions, sessionQueryOptions } from '../../lib/queries'
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
/** Dashboard plus the seven workspace tools. Account destinations live under the user. */
const WORKSPACE_NAV_ITEM_COUNT = 8

beforeEach(() => {
  installFakeAuth()
  window.localStorage.clear()
  delete document.documentElement.dataset['theme']
})

afterEach(() => {
  focusManager.setFocused(undefined)
  onlineManager.setOnline(true)
  vi.unstubAllGlobals()
})

describe('application shell', () => {
  it('withholds child content for an unusable workspace and recovers through the existing chooser', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    client().state.activeOrganizationId = 'missing-workspace'
    const previous = client().state.organizations[0]
    if (previous === undefined) throw new Error('Expected previous workspace fixture')
    const { router, queryClient } = renderApp('/app/library')
    await screen.findByRole('button', { name: 'Choose an organization' })
    const stale = shellOrganizationSchema.parse({ ...previous, name: 'STALE_WORKSPACE_CANARY' })
    act(() => {
      queryClient.setQueryData(activeOrganizationQueryOptions.queryKey, stale)
    })
    expect(screen.queryByText('STALE_WORKSPACE_CANARY')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Choose an organization' }))
    expect(client().organization.getFullOrganization).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    await user.click(await screen.findByRole('menuitem', { name: 'My workspace' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/app'))
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('My workspace')
    expect(client().state.activeOrganizationId).toBe(`personal-${OWNER.id}`)
  })

  it.each(['focus', 'reconnect'] as const)(
    'revalidates the session on %s after bootstrap freshness expires',
    async (event) => {
      seedOwnerWorkspace(client())
      const { router, queryClient } = renderApp('/app')
      await screen.findByRole('heading', { level: 1 })
      client().getSession.mockResolvedValue({ data: null, error: null })
      act(() => {
        queryClient.setQueryData(sessionQueryOptions.queryKey, (session) => session, {
          updatedAt: 0,
        })
        if (event === 'focus') {
          focusManager.setFocused(false)
          focusManager.setFocused(true)
        } else {
          onlineManager.setOnline(false)
          onlineManager.setOnline(true)
        }
      })
      await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
      expect(screen.queryByRole('heading', { name: 'Acme Studio' })).not.toBeInTheDocument()
    },
  )
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
    expect(within(menuNav).getAllByRole('link')).toHaveLength(WORKSPACE_NAV_ITEM_COUNT)
    expect(within(menuNav).queryByRole('link', { name: 'Account settings' })).toBeNull()
    expect(within(menuNav).queryByRole('link', { name: 'Members' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Close menu' }))
    await user.click(screen.getByRole('button', { name: `Account menu for ${OWNER.name}` }))
    await user.click(await screen.findByRole('menuitem', { name: 'Members' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/app/members'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const settingsNav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(settingsNav).getByRole('link', { name: 'Account settings' })).toBeInTheDocument()
    expect(within(settingsNav).getByRole('link', { name: 'Invite people' })).toBeInTheDocument()
    expect(within(settingsNav).queryByRole('link', { name: 'Library' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Menu' }))
    await screen.findByRole('dialog', { name: 'Menu' })
    await user.click(screen.getByRole('button', { name: 'Close menu' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('uses contextual sidebar links for Administration instead of page tabs', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    client().state.user = { ...OWNER, role: 'owner' }
    const { router } = renderApp('/app/admin')
    await screen.findByRole('heading', { level: 1, name: 'Administration' })

    const adminNav = screen.getByRole('navigation', { name: 'Administration sections' })
    expect(within(adminNav).getByRole('link', { name: 'Users' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(adminNav).getByRole('link', { name: 'Organizations' })).toBeInTheDocument()
    expect(within(adminNav).getByRole('link', { name: 'Audit trail' })).toBeInTheDocument()
    expect(within(adminNav).getByRole('link', { name: 'Health' })).toBeInTheDocument()
    expect(within(adminNav).getByRole('link', { name: 'Client errors' })).toBeInTheDocument()
    expect(within(adminNav).queryByRole('link', { name: 'Library' })).toBeNull()
    expect(screen.queryByRole('tab')).toBeNull()

    await user.click(within(adminNav).getByRole('link', { name: 'Health' }))
    await waitFor(() => expect(router.state.location.search).toEqual({ section: 'health' }))
    expect(within(adminNav).getByRole('link', { name: 'Health' })).toHaveAttribute(
      'aria-current',
      'page',
    )
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
