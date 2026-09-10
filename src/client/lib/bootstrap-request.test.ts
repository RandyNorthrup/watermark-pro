/** Exercise the real bootstrap fetch/loader/query boundary with controlled transport timing. */
import type { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { loadAppContext, loadAppOrganization } from './app-bootstrap'
import { fetchBootstrapSnapshot } from './bootstrap-request'
import { currentOfflineUser, setOfflineUser } from './offline-context'
import {
  activeOrganizationQueryOptions,
  readActiveMemberRole,
  seedBootstrapQueries,
  sessionQueryOptions,
} from './queries'
import { createQueryClient } from './query-client'
import { ACCOUNT_ID_HEADER } from '../../shared/account-identity'
import { BOOTSTRAP_PATH } from '../../shared/bootstrap'
import { bootstrapFixture } from '../../shared/test-support/bootstrap-fixture'

const clients: QueryClient[] = []
beforeEach(() => {
  setOfflineUser(null)
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
})
afterEach(() => {
  for (const client of clients) client.clear()
  clients.length = 0
  setOfflineUser(null)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function queryClient() {
  const client = createQueryClient()
  clients.push(client)
  return client
}

function delayedResponse(status: number, hasSlowBody: boolean) {
  const entered = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  const payload = status === 200 ? bootstrapFixture() : { error: 'forbidden' }
  const response = Response.json(payload, { status })
  if (hasSlowBody)
    vi.spyOn(response, 'json').mockImplementation(async () => {
      entered.resolve(undefined)
      await release.promise
      return payload
    })
  const fetcher = vi.fn<typeof fetch>(async () => {
    if (!hasSlowBody) {
      entered.resolve(undefined)
      await release.promise
    }
    return response
  })
  vi.stubGlobal('fetch', fetcher)
  return { entered, release, fetcher }
}

describe('bootstrap request and query admission', () => {
  it.each([null, 'account-a'])(
    'discovers verified snapshot with expected owner %s',
    async (owner) => {
      setOfflineUser(owner)
      const snapshot = bootstrapFixture()
      const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(Response.json(snapshot)))
      vi.stubGlobal('fetch', fetcher)
      await expect(fetchBootstrapSnapshot()).resolves.toEqual(snapshot)
      expect(fetcher).toHaveBeenCalledOnce()
      expect(fetcher.mock.calls[0]?.[0]).toBe(BOOTSTRAP_PATH)
      const options = fetcher.mock.calls[0]?.[1]
      expect(options).toMatchObject({
        method: 'POST',
        cache: 'no-store',
        body: '{}',
      })
      expect(new Headers(options?.headers).get(ACCOUNT_ID_HEADER)).toBe(owner)
    },
  )

  it('seeds all existing shell queries from one request and avoids initial session/organization/role refetches', async () => {
    const snapshot = bootstrapFixture()
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(Response.json(snapshot)))
    vi.stubGlobal('fetch', fetcher)
    const client = queryClient()
    const context = await loadAppContext(client, '/app')
    expect(context.session).toEqual(snapshot.session)
    expect(await loadAppOrganization({ ...context, queryClient: client })).toEqual(
      snapshot.organization,
    )
    expect(await readActiveMemberRole(client)).toEqual(snapshot.role)
    expect(await client.query(sessionQueryOptions)).toEqual(snapshot.session)
    expect(fetcher).toHaveBeenCalledOnce()
    expect(currentOfflineUser()).toBe('account-a')
  })

  it.each(
    [200, 401, 403].flatMap((status) =>
      [false, true].map((hasSlowBody) => ({ status, hasSlowBody })),
    ),
  )(
    'rejects old HTTP $status with delayed body=$hasSlowBody without clearing B or using query cancellation',
    async ({ status, hasSlowBody }) => {
      setOfflineUser('account-a')
      const client = queryClient()
      seedBootstrapQueries(client, bootstrapFixture())
      const transport = delayedResponse(status, hasSlowBody)
      const pending = loadAppContext(client, '/app')
      await transport.entered.promise
      setOfflineUser('account-b')
      const accountB = bootstrapFixture('account-b')
      seedBootstrapQueries(client, accountB)
      transport.release.resolve(undefined)
      await expect(pending).rejects.toThrow('account changed')
      expect(client.getQueryData(sessionQueryOptions.queryKey)).toEqual(accountB.session)
      expect(client.getQueryData(activeOrganizationQueryOptions.queryKey)).toEqual(
        accountB.organization,
      )
      expect(currentOfflineUser()).toBe('account-b')
    },
  )

  it('invalidates discovery after a second explicit lock even though the owner stays null', async () => {
    const transport = delayedResponse(200, true)
    const pending = fetchBootstrapSnapshot()
    await transport.entered.promise
    setOfflineUser(null)
    transport.release.resolve(undefined)
    await expect(pending).rejects.toThrow('account changed')
  })

  it('rejects a valid snapshot for another live identity and malformed linked data', async () => {
    setOfflineUser('account-a')
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() => Promise.resolve(Response.json(bootstrapFixture('account-b')))),
    )
    await expect(fetchBootstrapSnapshot()).rejects.toThrow('account changed')
    const mixed = bootstrapFixture()
    mixed.role = { role: 'viewer' }
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() => Promise.resolve(Response.json(mixed))),
    )
    const client = queryClient()
    await expect(loadAppContext(client, '/app')).rejects.toThrow('must match')
    expect(client.getQueryData(sessionQueryOptions.queryKey)).toBeUndefined()
    expect(currentOfflineUser()).toBe('account-a')
  })

  it('retains transport-only offline fallback and refuses server denial or invalid bodies', async () => {
    setOfflineUser('account-a')
    const client = queryClient()
    seedBootstrapQueries(client, bootstrapFixture())
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() => Promise.reject(new TypeError('Network unavailable'))),
    )
    const offline = await loadAppContext(client, '/app/editor')
    expect(offline.isOffline).toBe(true)
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() =>
        Promise.resolve(Response.json({ error: 'internal_error' }, { status: 500 })),
      ),
    )
    await expect(loadAppContext(client, '/app/editor')).rejects.toMatchObject({ status: 500 })
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() => Promise.resolve(new Response('invalid JSON'))),
    )
    await expect(loadAppContext(client, '/app/editor')).rejects.toBeInstanceOf(SyntaxError)
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() =>
        Promise.resolve(Response.json({ error: 'forbidden' }, { status: 403 })),
      ),
    )
    await expect(loadAppContext(client, '/app/editor')).rejects.toMatchObject({ status: 403 })
    expect(currentOfflineUser()).toBeNull()
    expect(client.getQueryData(sessionQueryOptions.queryKey)).toBeUndefined()
  })

  it('redirects anonymous startup to sign-in and preserves the requested destination', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() =>
        Promise.resolve(Response.json({ error: 'unauthenticated' }, { status: 401 })),
      ),
    )
    await expect(loadAppContext(queryClient(), '/app/editor')).rejects.toMatchObject({
      options: { to: '/login', search: { redirect: '/app/editor' } },
    })
  })
})
