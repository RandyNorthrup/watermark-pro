import { focusManager, onlineManager, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HTTP_STATUS } from '../../../shared/constants'
import { shellOrganizationSchema } from '../../../shared/shell-cache'
import { AppShell } from '../../components/app-shell'
import { activeOrganizationQueryOptions, sessionQueryOptions } from '../../lib/queries'
import { createQueryClient } from '../../lib/query-client'
import {
  makeMember,
  makeOrganization,
  OWNER,
  seedOwnerWorkspace,
} from '../../test-support/fake-auth-client'
import { fakeAuth, installFakeAuth } from '../../test-support/fake-auth-module'
import { installLibraryApi } from '../../test-support/fake-library-api'
import { renderApp } from '../../test-support/render-app'

vi.mock('../../lib/auth-client', () => import('../../test-support/fake-auth-module'))
vi.mock('../../components/offline-panel', () => ({
  OfflinePanel: ({ shouldManageSync }: { shouldManageSync: boolean }) => (
    <section aria-label="Offline work" data-sync-owner={String(shouldManageSync)}>
      <button>Sync now</button>
    </section>
  ),
}))

const client = fakeAuth
/** Seven workspace tools; Overview is reserved for site managers. Account destinations live under the user. */
const WORKSPACE_NAV_ITEM_COUNT = 7

beforeEach(() => {
  installFakeAuth()
  installLibraryApi()
  window.localStorage.clear()
  delete document.documentElement.dataset['theme']
})

afterEach(() => {
  focusManager.setFocused(undefined)
  onlineManager.setOnline(true)
  vi.unstubAllGlobals()
})

describe('application shell', () => {
  it('places one sync owner in the sidebar and shared controls at the bottom of the phone menu', async () => {
    seedOwnerWorkspace(client())
    const { data: session } = await client().getSession()
    if (session === null) throw new Error('Expected signed-in session')
    // This test admits storage only to exercise shell placement; recovery controls
    // and the single synchronization lifecycle have real IndexedDB browser tests.
    vi.stubGlobal('indexedDB', {})
    const root = createRootRoute({
      component: () => (
        <AppShell session={session} organization={null} organizations={[]}>
          <h1>Actual tool content</h1>
        </AppShell>
      ),
    })
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    render(
      <QueryClientProvider client={createQueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    const sidebar = await screen.findByRole('complementary')
    expect(await within(sidebar).findByRole('region', { name: 'Offline work' })).toHaveAttribute(
      'data-sync-owner',
      'true',
    )
    expect(
      within(screen.getByRole('main')).queryByRole('button', { name: 'Sync now' }),
    ).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Menu' }))
    const menu = await screen.findByRole('dialog', { name: 'Menu' })
    const mobileSync = await within(menu).findByRole('region', { name: 'Offline work' })
    expect(mobileSync).toHaveAttribute('data-sync-owner', 'false')
    expect(mobileSync.parentElement).toBe(menu.lastElementChild)
    expect(within(mobileSync).getByRole('button', { name: 'Sync now' })).toBeInTheDocument()
  })
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
    await waitFor(() => expect(router.state.location.pathname).toBe('/app/editor'))
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Editor')
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
    await waitFor(() => expect(router.state.location.pathname).toBe('/app/editor'))
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
    ).toEqual(['Editor', 'Library', 'Bulk', 'Gallery'])
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
