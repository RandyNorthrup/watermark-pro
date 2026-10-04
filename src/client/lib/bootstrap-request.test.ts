/** Exercise the real bootstrap fetch/loader/query boundary with controlled transport timing. */
import type { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { loadAppContext, loadAppOrganization } from './app-bootstrap'
import { fetchBootstrapSnapshot } from './bootstrap-request'
import {
  ACCOUNT_CHANGED_EVENT,
  activateOfflineAccount,
  lockOfflineAccount,
} from './offline-account'
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
  localStorage.clear()
  setOfflineUser(null)
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
})
afterEach(() => {
  for (const client of clients) client.clear()
  clients.length = 0
  localStorage.clear()
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

/** Control only platform lock timing; real activation and epoch protections remain authoritative. */
function holdDeviceLock() {
  const entered = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  const previous = Object.getOwnPropertyDescriptor(navigator, 'locks')
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: async (_name: string, action: () => Promise<void>) => {
        entered.resolve(undefined)
        await release.promise
        await action()
      },
    },
  })
  return {
    entered: entered.promise,
    release: () => release.resolve(undefined),
    async beginBootstrap() {
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>(() => Promise.resolve(Response.json(bootstrapFixture()))),
      )
      const client = queryClient()
      const pending = Promise.allSettled([loadAppContext(client, '/app/admin')])
      await entered.promise
      return { client, pending }
    },
    restore() {
      release.resolve(undefined)
      if (previous === undefined) Reflect.deleteProperty(navigator, 'locks')
      else Object.defineProperty(navigator, 'locks', previous)
    },
  }
}

describe('bootstrap request and query admission', () => {
  it('admits both concurrent cold starts for the same authenticated route and account', async () => {
    const release = Promise.withResolvers<undefined>()
    const snapshot = bootstrapFixture()
    const fetcher = vi.fn<typeof fetch>(async () => {
      await release.promise
      return Response.json(snapshot)
    })
    vi.stubGlobal('fetch', fetcher)
    const client = queryClient()
    const admissions = Promise.allSettled([
      loadAppContext(client, '/app/admin'),
      loadAppContext(client, '/app/admin'),
    ])
    release.resolve(undefined)
    const results = await admissions
    expect({
      admissions: results.map((result) => result.status),
      bootstrapRequests: fetcher.mock.calls.length,
    }).toEqual({ admissions: ['fulfilled', 'fulfilled'], bootstrapRequests: 1 })
    for (const result of results)
      if (result.status === 'fulfilled') {
        expect(result.value.session).toEqual(snapshot.session)
        expect(result.value.organizations).toEqual(snapshot.organizations)
        expect(result.value.isOffline).toBe(false)
      }
    expect(currentOfflineUser()).toBe(snapshot.session.user.id)
    expect(client.getQueryData(sessionQueryOptions.queryKey)).toEqual(snapshot.session)
  })

  it('rejects both pending discoveries after an actual lock without reviving their account', async () => {
    const release = Promise.withResolvers<undefined>()
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => {
        await release.promise
        return Response.json(bootstrapFixture())
      }),
    )
    const client = queryClient()
    const admissions = Promise.allSettled([
      loadAppContext(client, '/app/admin'),
      loadAppContext(client, '/app/admin'),
    ])
    lockOfflineAccount(client)
    release.resolve(undefined)
    const results = await admissions
    for (const result of results) {
      expect(result.status).toBe('rejected')
      if (result.status === 'rejected') expect(String(result.reason)).toContain('account changed')
    }
    expect(currentOfflineUser()).toBeNull()
    expect(client.getQueryData(sessionQueryOptions.queryKey)).toBeUndefined()
  })

  it('shares the same admission while its real account activation waits for a device lock', async () => {
    const lock = holdDeviceLock()
    try {
      const snapshot = bootstrapFixture()
      const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(Response.json(snapshot)))
      vi.stubGlobal('fetch', fetcher)
      const client = queryClient()
      const first = loadAppContext(client, '/app/admin')
      await lock.entered
      expect(currentOfflineUser()).toBeNull()
      expect(client.getQueryData(sessionQueryOptions.queryKey)).toBeUndefined()
      const second = loadAppContext(client, '/app/admin')
      const outcomes = Promise.allSettled([first, second])
      const requestsAtJoin = fetcher.mock.calls.length
      lock.release()
      const results = await outcomes
      expect({
        admissions: results.map((result) => result.status),
        requestsAtJoin,
      }).toEqual({ admissions: ['fulfilled', 'fulfilled'], requestsAtJoin: 1 })
      expect(currentOfflineUser()).toBe(snapshot.session.user.id)
      expect(client.getQueryData(sessionQueryOptions.queryKey)).toEqual(snapshot.session)
    } finally {
      lock.restore()
    }
  })

  it('keeps different-route offline policy separate while boot requests overlap', async () => {
    setOfflineUser('account-a')
    const client = queryClient()
    const snapshot = bootstrapFixture()
    seedBootstrapQueries(client, snapshot)
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.reject(new TypeError('Controlled transport outage')),
    )
    vi.stubGlobal('fetch', fetcher)
    const [editor, administration] = await Promise.allSettled([
      loadAppContext(client, '/app/editor'),
      loadAppContext(client, '/app/admin'),
    ])
    expect(editor.status).toBe('fulfilled')
    if (editor.status === 'fulfilled') expect(editor.value.isOffline).toBe(true)
    expect(administration.status).toBe('rejected')
    if (administration.status === 'rejected')
      expect(administration.reason).toMatchObject({ reason: 'online-only' })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(client.getQueryData(sessionQueryOptions.queryKey)).toEqual(snapshot.session)
  })

  it('starts a fresh flight after a synchronous real lock during activation announces its reset', async () => {
    const lock = holdDeviceLock()
    const client = queryClient()
    let hasLocked = false
    const lockDuringReset = () => {
      if (hasLocked || currentOfflineUser() !== null) return
      hasLocked = true
      lockOfflineAccount(client)
    }
    window.addEventListener(ACCOUNT_CHANGED_EVENT, lockDuringReset)
    try {
      const snapshot = bootstrapFixture()
      const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(Response.json(snapshot)))
      vi.stubGlobal('fetch', fetcher)
      const old = loadAppContext(client, '/app/admin')
      await lock.entered
      expect(hasLocked).toBe(true)
      window.removeEventListener(ACCOUNT_CHANGED_EVENT, lockDuringReset)
      const fresh = loadAppContext(client, '/app/admin')
      const outcomes = Promise.allSettled([old, fresh])
      const requestsBeforeRelease = fetcher.mock.calls.length
      lock.release()
      const results = await outcomes
      expect({
        admissions: results.map((result) => result.status),
        requestsBeforeRelease,
      }).toEqual({ admissions: ['rejected', 'fulfilled'], requestsBeforeRelease: 2 })
      expect(currentOfflineUser()).toBe(snapshot.session.user.id)
      expect(client.getQueryData(sessionQueryOptions.queryKey)).toEqual(snapshot.session)
    } finally {
      window.removeEventListener(ACCOUNT_CHANGED_EVENT, lockDuringReset)
      lock.restore()
    }
  })

  it.each(['lock', 'switch'] as const)(
    'rejects actual %s during platform-lock admission without granting the old account',
    async (transition) => {
      const lock = holdDeviceLock()
      try {
        const { client, pending: old } = await lock.beginBootstrap()
        let switching: Promise<void> | undefined
        if (transition === 'lock') lockOfflineAccount(client)
        else switching = activateOfflineAccount(client, 'account-b')
        lock.release()
        const [result] = await old
        expect(result.status).toBe('rejected')
        if (result.status === 'rejected') expect(String(result.reason)).toContain('account changed')
        await switching
        expect(currentOfflineUser()).toBe(transition === 'lock' ? null : 'account-b')
        expect(client.getQueryData(sessionQueryOptions.queryKey)).toBeUndefined()
      } finally {
        lock.restore()
      }
    },
  )

  it('loads a new snapshot after a same-path admission settles instead of caching success', async () => {
    const first = bootstrapFixture()
    const second = bootstrapFixture()
    second.session.user.name = 'New live display value'
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(first))
      .mockResolvedValueOnce(Response.json(second))
    vi.stubGlobal('fetch', fetcher)
    const client = queryClient()
    const firstContext = await loadAppContext(client, '/app/admin')
    expect(firstContext.session).toEqual(first.session)
    const secondContext = await loadAppContext(client, '/app/admin')
    expect(secondContext.session).toEqual(second.session)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(client.getQueryData(sessionQueryOptions.queryKey)).toEqual(second.session)
  })

  it.each(['lock', 'switch'] as const)(
    'rejects a synchronous real %s from final activation announcement before seeding',
    async (transition) => {
      const client = queryClient()
      const snapshot = bootstrapFixture()
      const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(Response.json(snapshot)))
      vi.stubGlobal('fetch', fetcher)
      let hasChanged = false
      let switching: Promise<void> | undefined
      const changeDuringCommit = () => {
        if (hasChanged || currentOfflineUser() !== snapshot.session.user.id) return
        hasChanged = true
        if (transition === 'lock') lockOfflineAccount(client)
        else switching = activateOfflineAccount(client, 'account-b')
      }
      window.addEventListener(ACCOUNT_CHANGED_EVENT, changeDuringCommit)
      try {
        const results = await Promise.allSettled([
          loadAppContext(client, '/app/admin'),
          loadAppContext(client, '/app/admin'),
        ])
        expect(hasChanged).toBe(true)
        expect(fetcher).toHaveBeenCalledOnce()
        for (const result of results) {
          expect(result.status).toBe('rejected')
          if (result.status === 'rejected')
            expect(String(result.reason)).toContain('account changed')
        }
        await switching
        expect(currentOfflineUser()).toBe(transition === 'lock' ? null : 'account-b')
        expect(client.getQueryData(sessionQueryOptions.queryKey)).toBeUndefined()
      } finally {
        window.removeEventListener(ACCOUNT_CHANGED_EVENT, changeDuringCommit)
        await switching
      }
    },
  )

  it.each(['account-a', 'account-b'])(
    'rejects direct owner %s changes while real activation waits without adopting their epoch',
    async (userId) => {
      const lock = holdDeviceLock()
      try {
        const { client, pending: old } = await lock.beginBootstrap()
        expect(currentOfflineUser()).toBeNull()
        setOfflineUser(userId)
        lock.release()
        const [result] = await old
        expect(result.status).toBe('rejected')
        if (result.status === 'rejected') expect(String(result.reason)).toContain('account changed')
        expect(currentOfflineUser()).toBe(userId)
        expect(client.getQueryData(sessionQueryOptions.queryKey)).toBeUndefined()
      } finally {
        lock.restore()
      }
    },
  )

  it('rejects the old epoch after real A-to-B-to-A transitions even when its user id matches again', async () => {
    const releaseOld = Promise.withResolvers<undefined>()
    let shouldHoldOld = true
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => {
        const shouldWait = shouldHoldOld
        if (shouldWait) await releaseOld.promise
        return Response.json(bootstrapFixture())
      }),
    )
    setOfflineUser('account-a')
    const client = queryClient()
    seedBootstrapQueries(client, bootstrapFixture())
    const old = Promise.allSettled([loadAppContext(client, '/app/admin')])
    await activateOfflineAccount(client, 'account-b')
    await activateOfflineAccount(client, 'account-a')
    shouldHoldOld = false
    const current = await loadAppContext(client, '/app/admin')
    expect(current.session.user.id).toBe('account-a')
    releaseOld.resolve(undefined)
    const [result] = await old
    expect(result.status).toBe('rejected')
    if (result.status === 'rejected') expect(String(result.reason)).toContain('account changed')
    expect(client.getQueryData(sessionQueryOptions.queryKey)).toEqual(bootstrapFixture().session)
    expect(currentOfflineUser()).toBe('account-a')
  })

  it('keeps the newer pending flight after an older failed flight settles', async () => {
    const releaseA = Promise.withResolvers<undefined>()
    const releaseB = Promise.withResolvers<undefined>()
    let respondingAccount = 'account-a'
    const fetcher = vi.fn<typeof fetch>(async () => {
      const snapshot = bootstrapFixture(respondingAccount)
      await (snapshot.session.user.id === 'account-a' ? releaseA.promise : releaseB.promise)
      return Response.json(snapshot)
    })
    vi.stubGlobal('fetch', fetcher)
    setOfflineUser('account-a')
    const client = queryClient()
    seedBootstrapQueries(client, bootstrapFixture())
    const old = Promise.allSettled([loadAppContext(client, '/app/admin')])
    await activateOfflineAccount(client, 'account-b')
    respondingAccount = 'account-b'
    const firstB = loadAppContext(client, '/app/admin')
    releaseA.resolve(undefined)
    const [oldResult] = await old
    expect(oldResult.status).toBe('rejected')
    const secondB = loadAppContext(client, '/app/admin')
    const outcomes = Promise.allSettled([firstB, secondB])
    const requestsBeforeRelease = fetcher.mock.calls.length
    releaseB.resolve(undefined)
    const results = await outcomes
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled'])
    expect(requestsBeforeRelease).toBe(2)
    expect(currentOfflineUser()).toBe('account-b')
    expect(client.getQueryData(sessionQueryOptions.queryKey)).toEqual(
      bootstrapFixture('account-b').session,
    )
  })

  it('admits a real account switch while rejecting late successes from its old pending route', async () => {
    const releaseOld = Promise.withResolvers<undefined>()
    let respondingAccount = 'account-a'
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => {
        const snapshot = bootstrapFixture(respondingAccount)
        if (snapshot.session.user.id === 'account-a') await releaseOld.promise
        return Response.json(snapshot)
      }),
    )
    setOfflineUser('account-a')
    const client = queryClient()
    seedBootstrapQueries(client, bootstrapFixture())
    const oldAdmissions = Promise.allSettled([
      loadAppContext(client, '/app/admin'),
      loadAppContext(client, '/app/admin'),
    ])
    await activateOfflineAccount(client, 'account-b')
    respondingAccount = 'account-b'
    const accountB = bootstrapFixture('account-b')
    const current = await loadAppContext(client, '/app/admin')
    expect(current.session).toEqual(accountB.session)
    releaseOld.resolve(undefined)
    const oldResults = await oldAdmissions
    for (const result of oldResults) {
      expect(result.status).toBe('rejected')
      if (result.status === 'rejected') expect(String(result.reason)).toContain('account changed')
    }
    expect(currentOfflineUser()).toBe('account-b')
    expect(client.getQueryData(sessionQueryOptions.queryKey)).toEqual(accountB.session)
    expect(client.getQueryData(activeOrganizationQueryOptions.queryKey)).toEqual(
      accountB.organization,
    )
  })

  it('rejects a late foreign discovery after an actual local account admission', async () => {
    const release = Promise.withResolvers<undefined>()
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => {
        await release.promise
        return Response.json(bootstrapFixture('account-b'))
      }),
    )
    const client = queryClient()
    const pending = Promise.allSettled([loadAppContext(client, '/app/admin')])
    await activateOfflineAccount(client, 'account-a')
    const accountA = bootstrapFixture()
    seedBootstrapQueries(client, accountA)
    release.resolve(undefined)
    const [result] = await pending
    expect(result.status).toBe('rejected')
    if (result.status === 'rejected') expect(String(result.reason)).toContain('account changed')
    expect(currentOfflineUser()).toBe('account-a')
    expect(client.getQueryData(sessionQueryOptions.queryKey)).toEqual(accountA.session)
  })

  it.each([false, true])(
    'keeps online-only concurrent routes refused when network advertised=%s',
    async (isOnline) => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(isOnline)
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>(() => Promise.reject(new TypeError('Controlled transport outage'))),
      )
      setOfflineUser('account-a')
      const client = queryClient()
      const snapshot = bootstrapFixture()
      seedBootstrapQueries(client, snapshot)
      const admissions = await Promise.allSettled([
        loadAppContext(client, '/app/admin'),
        loadAppContext(client, '/app/admin'),
      ])
      for (const result of admissions) {
        expect(result.status).toBe('rejected')
        if (result.status === 'rejected')
          expect(result.reason).toMatchObject({ reason: 'online-only' })
      }
      expect(currentOfflineUser()).toBe('account-a')
      expect(client.getQueryData(sessionQueryOptions.queryKey)).toEqual(snapshot.session)
    },
  )

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
