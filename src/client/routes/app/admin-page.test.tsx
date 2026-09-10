import { act, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ADMIN_SECTIONS,
  parseAdminSection,
  type AdminSection,
} from '../../../shared/admin-sections'
import { HTTP_STATUS } from '../../../shared/constants'
import { OWNER, seedOwnerWorkspace, VIEWER } from '../../test-support/fake-auth-client'
import { fakeAuth, installFakeAuth } from '../../test-support/fake-auth-module'
import { renderApp } from '../../test-support/render-app'
import { requestUrl } from '../../test-support/request-url'

vi.mock('../../lib/auth-client', () => import('../../test-support/fake-auth-module'))

const client = fakeAuth

function stubAdminApi(failure: number | null = null) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      if (failure !== null) {
        return Promise.resolve(Response.json({ error: 'forbidden' }, { status: failure }))
      }
      const url = requestUrl(input)
      if (url.endsWith('/api/admin/account-stats'))
        return Promise.resolve(
          Response.json({
            users: 2,
            verifiedUsers: 2,
            pendingInvitations: 1,
            acceptedInvitations: 1,
          }),
        )
      if (url.endsWith('/api/admin/organizations')) {
        return Promise.resolve(
          Response.json({
            organizations: [
              {
                id: 'org-1',
                name: 'Acme Studio',
                slug: 'acme-studio',
                createdAt: '2026-09-01T00:00:00.000Z',
                memberCount: 2,
                photoCount: 12,
                storageBytes: 5 * 1024 * 1024,
              },
            ],
          }),
        )
      }
      if (url.endsWith('/api/admin/audit')) {
        return Promise.resolve(
          Response.json({
            entries: [
              {
                id: 'a1',
                organizationId: null,
                actorUserId: OWNER.id,
                actorName: OWNER.name,
                action: 'admin.user_banned',
                targetType: 'user',
                targetId: VIEWER.id,
                metadata: null,
                createdAt: '2026-09-05T10:00:00.000Z',
              },
            ],
          }),
        )
      }
      if (url.endsWith('/api/admin/health')) {
        return Promise.resolve(
          Response.json({
            checks: [
              {
                id: 'h1',
                ok: true,
                detail: null,
                durationMs: 12,
                createdAt: '2026-09-08T10:00:00.000Z',
              },
              {
                id: 'h2',
                ok: false,
                detail: 'db unreachable',
                durationMs: 30,
                createdAt: '2026-09-08T09:55:00.000Z',
              },
            ],
          }),
        )
      }
      if (url.endsWith('/api/admin/client-errors')) {
        return Promise.resolve(
          Response.json({
            errors: [
              {
                id: 'e1',
                message: 'Cannot read properties of undefined',
                source: 'at render (app.js:1:2)',
                route: '/app/editor',
                userAgent: 'test',
                requestId: 'req-1',
                userId: null,
                createdAt: '2026-09-08T10:00:00.000Z',
              },
            ],
          }),
        )
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`))
    }),
  )
}

beforeEach(() => {
  installFakeAuth()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Signs in as a platform admin, stubs the admin API, renders the page, and waits for it. */
async function renderAsAdmin(section?: AdminSection, failure: number | null = null) {
  seedOwnerWorkspace(client())
  client().state.user = { ...OWNER, role: 'admin' }
  client().state.allUsers = [{ ...OWNER, role: 'admin' }]
  stubAdminApi(failure)
  const view = renderApp(section === undefined ? '/app/admin' : `/app/admin?section=${section}`)
  await screen.findByRole('heading', { level: 1 })
  return view
}

describe('administration page', () => {
  it('validates section identifiers and defaults only an absent section to Users', () => {
    expect(parseAdminSection({})).toBe('users')
    for (const section of ADMIN_SECTIONS) expect(parseAdminSection({ section })).toBe(section)
    for (const section of ['members', '', 1, null, ['users', 'health']]) {
      expect(() => parseAdminSection({ section })).toThrow()
    }
  })

  it('defaults to the real Users panel without rendering horizontal tabs', async () => {
    await renderAsAdmin()
    expect(await screen.findByRole('heading', { level: 2, name: 'Users' })).toBeInTheDocument()
    expect(await screen.findByLabelText('Search by email')).toBeInTheDocument()
    expect(client().admin.listUsers).toHaveBeenCalledOnce()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it.each(ADMIN_SECTIONS)('hides the %s section from ordinary users', async (section) => {
    seedOwnerWorkspace(client())
    stubAdminApi()
    renderApp(`/app/admin?section=${section}`)
    expect(await screen.findByRole('alert')).toHaveTextContent('Only the site owner or an admin')
    // The refusal still has a page heading, so assistive tech knows where it landed.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Administration')
    expect(screen.queryByLabelText('Search by email')).not.toBeInTheDocument()
    expect(client().admin.listUsers).not.toHaveBeenCalled()
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
  })

  it('lets a site admin moderate non-owner accounts and search users', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    client().state.user = { ...OWNER, role: 'admin' }
    client().state.allUsers = [
      { ...OWNER, role: 'admin' },
      { ...VIEWER, role: 'user' },
      { ...VIEWER, id: 'user-3', email: 'third@example.test', name: 'Thea Third' },
    ]
    stubAdminApi()
    renderApp('/app/admin')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Administration')
    expect(screen.getByRole('heading', { level: 2, name: 'Users' })).toBeInTheDocument()
    expect(await screen.findByText('3 users.')).toBeInTheDocument()
    expect(screen.getByText('(you)')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: `Ban ${OWNER.email}` })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: `Ban ${VIEWER.email}` }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByRole('button', { name: 'Ban user' })).toBeDisabled()
    await user.type(within(dialog).getByLabelText('Reason'), 'spam')
    await user.click(within(dialog).getByRole('button', { name: 'Ban user' }))
    await waitFor(() => expect(screen.getByText('banned: spam')).toBeInTheDocument())
    expect(client().admin.banUser).toHaveBeenCalledWith({ userId: VIEWER.id, banReason: 'spam' })

    await user.click(screen.getByRole('button', { name: `Unban ${VIEWER.email}` }))
    await waitFor(() => expect(screen.queryByText('banned: spam')).not.toBeInTheDocument())

    expect(
      screen.queryByRole('button', { name: `Make ${VIEWER.email} an admin` }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: `Remove admin from ${OWNER.email}` }),
    ).not.toBeInTheDocument()
    expect(client().admin.setRole).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: `Sign out ${VIEWER.email} everywhere` }))
    await waitFor(() =>
      expect(client().admin.revokeUserSessions).toHaveBeenCalledWith({ userId: VIEWER.id }),
    )

    await user.type(screen.getByLabelText('Search by email'), 'third')
    await waitFor(() => expect(screen.getByText('1 user.')).toBeInTheDocument())
    expect(screen.getByText('Thea Third')).toBeInTheDocument()
  })

  it('shows organizations and the global audit trail', async () => {
    const { router } = await renderAsAdmin('organizations')
    const table = await screen.findByRole('table', { name: /Organizations/ })
    expect(within(table).getByText('Acme Studio')).toBeInTheDocument()
    expect(within(table).getByText('5.0 MB')).toBeInTheDocument()
    expect(screen.queryByLabelText('Search by email')).not.toBeInTheDocument()
    expect(client().admin.listUsers).not.toHaveBeenCalled()
    await act(async () => {
      await router.navigate({ to: '/app/admin', search: { section: 'audit' } })
    })
    const audit = await screen.findByRole('table', { name: /Audit entries/ })
    expect(within(audit).getByText('admin.user_banned')).toBeInTheDocument()
    expect(within(audit).getByText('platform')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Audit trail' })).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: /Organizations/ })).not.toBeInTheDocument()
    act(() => router.history.back())
    expect(await screen.findByRole('table', { name: /Organizations/ })).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: /Audit entries/ })).not.toBeInTheDocument()
  })

  it('shows recent health checks and reported client errors', async () => {
    const { router } = await renderAsAdmin('health')
    expect(await screen.findByText('1 of 2 recent checks passed.')).toBeInTheDocument()
    expect(screen.getByText('db unreachable')).toBeInTheDocument()

    await act(async () => {
      await router.navigate({ to: '/app/admin', search: { section: 'client-errors' } })
    })
    expect(await screen.findByText('Cannot read properties of undefined')).toBeInTheDocument()
    expect(screen.getByText(/on \/app\/editor/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Client errors' })).toBeInTheDocument()
    expect(screen.queryByText('db unreachable')).not.toBeInTheDocument()
    expect(client().admin.listUsers).not.toHaveBeenCalled()
  })

  it('reports failed admin loads', async () => {
    await renderAsAdmin('organizations', HTTP_STATUS.forbidden)
    const alerts = await screen.findAllByRole('alert')
    expect(
      alerts.every((alert) => alert.textContent.includes('Your role does not allow this.')),
    ).toBe(true)
  })
})
