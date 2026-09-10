import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiRequestError } from './api'
import { loadAppContext, loadAppOrganization } from './app-bootstrap'
import { currentOfflineUser, setOfflineUser } from './offline-context'
import {
  activeMemberRoleQueryOptions,
  activeOrganizationQueryOptions,
  organizationsQueryOptions,
  readActiveMemberRole,
  sessionQueryOptions,
} from './queries'
import { loadPersistedQueries, persistQueries } from './query-persister'
import { shellCacheSchema } from '../../shared/shell-cache'
import { OWNER, seedOwnerWorkspace } from '../test-support/fake-auth-client'
import { fakeAuth, installFakeAuth } from '../test-support/fake-auth-module'

vi.mock('./auth-client', () => import('../test-support/fake-auth-module'))
vi.mock('./bootstrap-request', () => import('../test-support/fake-bootstrap'))

const clients: QueryClient[] = []
beforeEach(() => {
  localStorage.clear()
  seedOwnerWorkspace(installFakeAuth())
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
})
afterEach(() => {
  for (const client of clients) client.clear()
  clients.length = 0
  localStorage.clear()
  setOfflineUser(null)
  vi.restoreAllMocks()
})

async function preparedClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  clients.push(client)
  setOfflineUser(OWNER.id)
  await client.query(sessionQueryOptions)
  await client.query(organizationsQueryOptions)
  await client.query(activeOrganizationQueryOptions)
  await client.query(activeMemberRoleQueryOptions)
  return client
}

describe('Wi-Fi without Internet', () => {
  it.each([new TypeError('Load failed'), new ApiRequestError('/api/auth/get-session', 0)])(
    'admits only the prepared owner on transport failure and opens the cached workspace',
    async (failure) => {
      const client = await preparedClient()
      fakeAuth().getSession.mockRejectedValue(failure)
      fakeAuth().organization.getActiveMemberRole.mockRejectedValue(failure)
      const context = await loadAppContext(client, '/app/editor')
      expect(context.isOffline).toBe(true)
      expect(context.session.user.id).toBe(OWNER.id)
      const organization = await loadAppOrganization({ ...context, queryClient: client })
      expect(organization?.id).toBe('org-1')
      expect(await readActiveMemberRole(client)).toEqual({ role: 'owner' })
      expect(fakeAuth().organization.setActive).not.toHaveBeenCalled()
    },
  )

  it('refuses administration even when a prepared owner exists', async () => {
    const client = await preparedClient()
    fakeAuth().getSession.mockRejectedValue(new TypeError('Load failed'))
    await expect(loadAppContext(client, '/app/invitations')).rejects.toMatchObject({
      reason: 'online-only',
    })
  })

  it('refuses an absent, mismatched, or changed account snapshot', async () => {
    const client = await preparedClient()
    fakeAuth().getSession.mockRejectedValue(new TypeError('Load failed'))
    setOfflineUser('other-account')
    await expect(loadAppContext(client, '/app/editor')).rejects.toMatchObject({
      reason: 'not-prepared',
    })
    setOfflineUser(OWNER.id)
    fakeAuth().getSession.mockImplementation(() => {
      setOfflineUser('new-account')
      return Promise.reject(new TypeError('Load failed'))
    })
    await expect(loadAppContext(client, '/app/editor')).rejects.toThrow('account changed')
    client.clear()
    await expect(loadAppContext(client, '/app/editor')).rejects.toMatchObject({
      reason: 'not-prepared',
    })
  })

  it.each([401, 403])(
    'never restores a session after HTTP %s and clears its display snapshot',
    async (status) => {
      const client = await preparedClient()
      fakeAuth().getSession.mockResolvedValue({
        data: null,
        error: { status, code: 'DENIED', message: 'Denied' },
      })
      await expect(loadAppContext(client, '/app/editor')).rejects.toMatchObject(
        status === 401 ? { options: { to: '/login' } } : { status },
      )
      expect(currentOfflineUser()).toBeNull()
      expect(client.getQueryData(sessionQueryOptions.queryKey)).toBeUndefined()
    },
  )

  it('never uses an explicitly denied role again on later transport loss', async () => {
    const client = await preparedClient()
    fakeAuth().organization.getActiveMemberRole.mockResolvedValue({
      data: null,
      error: { status: 403, code: 'DENIED', message: 'Denied' },
    })
    await expect(readActiveMemberRole(client)).rejects.toMatchObject({ status: 403 })
    fakeAuth().organization.getActiveMemberRole.mockRejectedValue(new TypeError('Load failed'))
    await expect(readActiveMemberRole(client)).rejects.toThrow('Connect once')
  })

  it('still honors a live signed-out session and server faults', async () => {
    const client = await preparedClient()
    fakeAuth().getSession.mockResolvedValueOnce({
      data: null,
      error: { status: 500, code: 'SERVER_ERROR', message: 'Server failed' },
    })
    await expect(loadAppContext(client, '/app/editor')).rejects.toMatchObject({ status: 500 })
    fakeAuth().getSession.mockResolvedValue({ data: null, error: null })
    await expect(loadAppContext(client, '/app/editor')).rejects.toMatchObject({
      options: { to: '/login' },
    })
    expect(currentOfflineUser()).toBeNull()
  })
})

it.each([false, true])('keeps a >24h snapshot quarantined: revoked=%s', async (isRevoked) => {
  const source = await preparedClient()
  persistQueries(source, localStorage)
  const key = 'watermark-pro:query-cache'
  const snapshot = shellCacheSchema.parse(JSON.parse(localStorage.getItem(key) ?? 'null'))
  const twoDaysMs = 2 * 24 * 60 * 60 * 1000
  snapshot.at = Date.now() - twoDaysMs
  localStorage.setItem(key, JSON.stringify(snapshot))
  source.clear()
  const target = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  clients.push(target)
  loadPersistedQueries(target, localStorage)
  if (isRevoked) {
    fakeAuth().getSession.mockResolvedValue({
      data: null,
      error: { status: 403, code: 'DENIED', message: 'Denied' },
    })
    await expect(loadAppContext(target, '/app/editor')).rejects.toMatchObject({ status: 403 })
    expect(target.getQueryData(sessionQueryOptions.queryKey)).toBeUndefined()
    expect(currentOfflineUser()).toBeNull()
  } else {
    fakeAuth().getSession.mockRejectedValue(new TypeError('Load failed'))
    const context = await loadAppContext(target, '/app/editor')
    expect(context.isOffline).toBe(true)
    expect(context.session.user.id).toBe(OWNER.id)
  }
})
