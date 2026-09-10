/** Identity discovery is allowed while locked, but a request from an older generation cannot be adopted. */
import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { loadAppContext } from './app-bootstrap'
import { captureOfflineGeneration, currentOfflineUser, setOfflineUser } from './offline-context'
import { organizationsQueryOptions, sessionQueryOptions } from './queries'
import { OWNER, seedOwnerWorkspace } from '../test-support/fake-auth-client'
import { type FakeAuthClient, fakeAuth, installFakeAuth } from '../test-support/fake-auth-module'

vi.mock('./auth-client', () => import('../test-support/fake-auth-module'))
vi.mock('./bootstrap-request', () => import('../test-support/fake-bootstrap'))

type SessionResult = Awaited<ReturnType<FakeAuthClient['getSession']>>
const clients: QueryClient[] = []
beforeEach(() => {
  seedOwnerWorkspace(installFakeAuth())
  setOfflineUser(OWNER.id)
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
})
afterEach(() => {
  for (const client of clients) client.clear()
  clients.length = 0
  setOfflineUser(null)
  vi.restoreAllMocks()
})

function clientForTest() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  clients.push(client)
  return client
}

it('allows discovery with no admitted owner, but another lock invalidates that generation', () => {
  setOfflineUser(null)
  const generation = captureOfflineGeneration()
  expect(generation.assertCurrent).not.toThrow()
  setOfflineUser(null)
  expect(generation.assertCurrent).toThrow('account changed')
})

it('discovers a valid live session from an unchanged unknown-owner context', async () => {
  setOfflineUser(null)
  const client = clientForTest()
  const session = await client.query(sessionQueryOptions)
  expect(session?.user.id).toBe(OWNER.id)
  expect(currentOfflineUser()).toBeNull()
})

it.each(['response', 'error'] as const)(
  'does not replace B with a delayed A session %s without relying on query cancellation',
  async (kind) => {
    const client = clientForTest()
    const responseA = await fakeAuth().getSession()
    const transport = Promise.withResolvers<SessionResult>()
    fakeAuth().getSession.mockReturnValue(transport.promise)
    const pending = client.query(sessionQueryOptions)
    const responseB = {
      user: { id: 'account-b', name: 'Account B', email: 'b@example.test', emailVerified: true },
      session: { id: 'session-b', userId: 'account-b', activeOrganizationId: null },
    }
    // Keep this Query alive deliberately. No removeQueries, clear, or cancellation.
    setOfflineUser('account-b')
    client.setQueryData(sessionQueryOptions.queryKey, responseB)
    if (kind === 'response') transport.resolve(responseA)
    else
      transport.resolve({ data: null, error: { status: 403, message: 'A denied', code: 'DENIED' } })
    await expect(pending).rejects.toThrow('account changed')
    expect(client.getQueryData(sessionQueryOptions.queryKey)).toEqual(responseB)
    expect(currentOfflineUser()).toBe('account-b')
  },
)

it('refuses a late boot success after a different account becomes active', async () => {
  const client = clientForTest()
  const responseA = await fakeAuth().getSession()
  const transport = Promise.withResolvers<SessionResult>()
  fakeAuth().getSession.mockReturnValue(transport.promise)
  const pending = loadAppContext(client, '/app/editor')
  setOfflineUser('account-b')
  transport.resolve(responseA)
  await expect(pending).rejects.toThrow('account changed')
  expect(currentOfflineUser()).toBe('account-b')
  expect(client.getQueryData(sessionQueryOptions.queryKey)).toBeUndefined()
  expect(client.getQueryData(organizationsQueryOptions.queryKey)).toBeUndefined()
})

it('refuses a response that started with no owner before another locked transition', async () => {
  const responseA = await fakeAuth().getSession()
  setOfflineUser(null)
  const client = clientForTest()
  const transport = Promise.withResolvers<SessionResult>()
  fakeAuth().getSession.mockReturnValue(transport.promise)
  const pending = client.query(sessionQueryOptions)
  setOfflineUser(null)
  transport.resolve(responseA)
  await expect(pending).rejects.toThrow('account changed')
  expect(client.getQueryData(sessionQueryOptions.queryKey)).toBeUndefined()
})
