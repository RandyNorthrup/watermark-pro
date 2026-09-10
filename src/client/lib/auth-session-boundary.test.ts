/** Real installed Better Auth client/session atom; only HTTP transport timing is controlled. */
import { createAuthClient } from 'better-auth/client'
import { adminClient, organizationClient } from 'better-auth/client/plugins'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createAuthAccountHooks, withAuthAccountBoundary } from './auth-account'
import { setOfflineUser } from './offline-context'
import { ACCOUNT_ID_HEADER } from '../../shared/account-identity'

afterEach(() => {
  setOfflineUser(null)
  vi.restoreAllMocks()
})

function payload(id: string) {
  const createdAt = new Date()
  return {
    user: {
      id,
      email: `${id}@example.test`,
      name: `${id} private name`,
      emailVerified: true,
      role: 'user',
      banned: false,
      banReason: null,
      banExpires: null,
      createdAt,
      updatedAt: createdAt,
    },
    session: {
      id: `session-${id}`,
      userId: id,
      token: `fixture-${id}`,
      activeOrganizationId: null,
      impersonatedBy: null,
      createdAt,
      updatedAt: createdAt,
      expiresAt: new Date(Date.now() + 60_000),
    },
  }
}

function clientWithFetch(fetcher: typeof fetch) {
  return withAuthAccountBoundary(
    createAuthClient({
      baseURL: `${window.location.origin}/api/auth`,
      fetchOptions: { customFetchImpl: fetcher, ...createAuthAccountHooks() },
      plugins: [organizationClient(), adminClient()],
    }),
  )
}

function pendingClient(hasSlowBody: boolean, status = 200) {
  const waiting = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  const responseData = status === 200 ? payload('account-a') : { message: 'account-a-error-canary' }
  const response = Response.json(responseData, { status })
  if (hasSlowBody)
    vi.spyOn(response, 'text').mockImplementation(async () => {
      waiting.resolve(undefined)
      await release.promise
      return JSON.stringify(responseData)
    })
  const fetcher = vi.fn<typeof fetch>(async () => {
    if (!hasSlowBody) {
      waiting.resolve(undefined)
      await release.promise
    }
    return response
  })
  const client = clientWithFetch(fetcher)
  return { client, fetcher, waiting, release }
}

describe('SDK session discovery generation', () => {
  it.each(['session', 'organization', 'direct-fetch'] as const)(
    'blocks an earlier per-call success callback for stale %s data',
    async (route) => {
      setOfflineUser('account-a')
      const f = pendingClient(true)
      const consumed = vi.fn()
      const requests = {
        session: () => f.client.getSession({ fetchOptions: { onSuccess: consumed } }),
        organization: () => f.client.organization.list({}, { onSuccess: consumed }),
        'direct-fetch': () => f.client.$fetch('/organization/list', { onSuccess: consumed }),
      }
      const request = requests[route]()
      await f.waiting.promise
      setOfflineUser('account-b')
      f.release.resolve(undefined)
      await expect(request).rejects.toThrow('account changed')
      expect(consumed).not.toHaveBeenCalled()
    },
  )
  it('blocks per-call response/error callbacks before they can observe stale data', async () => {
    setOfflineUser('account-a')
    const headers = pendingClient(false)
    const received = vi.fn()
    const request = headers.client.getSession({}, { onResponse: received })
    await headers.waiting.promise
    setOfflineUser('account-b')
    headers.release.resolve(undefined)
    await expect(request).rejects.toThrow('account changed')
    expect(received).not.toHaveBeenCalled()

    setOfflineUser('account-a')
    const body = pendingClient(true, 403)
    const failed = vi.fn()
    const rejection = body.client.getSession({ fetchOptions: { onError: failed } })
    await body.waiting.promise
    setOfflineUser('account-b')
    body.release.resolve(undefined)
    await expect(rejection).rejects.toThrow('account changed')
    expect(failed).not.toHaveBeenCalled()
  })
  it('preserves caller query/headers/callback precedence and ordinary private SDK methods', async () => {
    setOfflineUser('account-a')
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(Response.json(payload('account-a'))))
    const client = clientWithFetch(fetcher)
    const embedded = vi.fn()
    const overridden = vi.fn()
    const result = await client.getSession(
      { query: { disableCookieCache: true }, fetchOptions: { onSuccess: embedded } },
      { headers: { 'x-fixture': 'preserved' }, onSuccess: overridden },
    )
    expect(result.data?.user.id).toBe('account-a')
    expect(embedded).toHaveBeenCalledOnce()
    expect(overridden).not.toHaveBeenCalled()
    expect(fetcher.mock.calls[0]?.[0]).toEqual(
      new URL(`${window.location.origin}/api/auth/get-session?disableCookieCache=true`),
    )
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('x-fixture')).toBe('preserved')
    await client.organization.list()
    await client.linkSocial({ provider: 'google' })
    await client.signOut()
    const calls = fetcher.mock.calls.slice(1)
    expect(calls).toHaveLength(3)
    for (const [, options] of calls)
      expect(new Headers(options?.headers).get(ACCOUNT_ID_HEADER)).toBe('account-a')
    setOfflineUser(null)
    expect(
      client.organization.checkRolePermission({
        role: 'owner',
        permissions: { organization: ['update'] },
      }),
    ).toBe(true)
  })
  it.each([false, true])(
    'rejects stale getSession with delayed body=%s and the captured account binding',
    async (hasSlowBody) => {
      setOfflineUser('account-a')
      const f = pendingClient(hasSlowBody)
      const request = f.client.getSession()
      await f.waiting.promise
      setOfflineUser('account-b')
      f.release.resolve(undefined)
      await expect(request).rejects.toThrow('account changed')
      expect(new Headers(f.fetcher.mock.calls[0]?.[1]?.headers).get(ACCOUNT_ID_HEADER)).toBe(
        'account-a',
      )
    },
  )
  it('invalidates anonymous discovery even when another explicit lock leaves the owner null', async () => {
    setOfflineUser(null)
    const f = pendingClient(false)
    const request = f.client.getSession()
    await f.waiting.promise
    setOfflineUser(null)
    f.release.resolve(undefined)
    await expect(request).rejects.toThrow('account changed')
  })
  it.each([false, true])(
    'keeps B in the actual SDK session atom when A finishes with delayed body=%s',
    async (hasSlowBody) => {
      setOfflineUser('account-a')
      const f = pendingClient(hasSlowBody)
      const history: string[] = []
      // Reading/refetching the real atom avoids mocking the state-management code.
      const request = f.client.useSession.get().refetch()
      await f.waiting.promise
      setOfflineUser('account-b')
      f.client.hydrateSession(payload('account-b'))
      const before = f.client.useSession.get()
      history.push(before.data?.user.id ?? '')
      f.release.resolve(undefined)
      await request
      const after = f.client.useSession.get()
      history.push(after.data?.user.id ?? '')
      expect(history).toEqual(['account-b', 'account-b'])
      expect(after.error).toBeInstanceOf(Error)
      expect(JSON.stringify(after.data)).not.toContain('account-a')
    },
  )
  it('preserves B in the real SDK atom when an old A session error finishes late', async () => {
    setOfflineUser('account-a')
    const f = pendingClient(true, 401)
    const request = f.client.useSession.get().refetch()
    await f.waiting.promise
    setOfflineUser('account-b')
    f.client.hydrateSession(payload('account-b'))
    f.release.resolve(undefined)
    await request
    expect(f.client.useSession.get().data?.user.id).toBe('account-b')
    expect(JSON.stringify(f.client.useSession.get().data)).not.toContain('account-a')
  })
  it('rejects an unexpected A identity while known B remains unchanged, before callbacks or atom replacement', async () => {
    setOfflineUser('account-b')
    const f = pendingClient(false)
    const received = vi.fn()
    const request = f.client.getSession({}, { onSuccess: received })
    await f.waiting.promise
    f.release.resolve(undefined)
    await expect(request).rejects.toThrow('account changed')
    expect(received).not.toHaveBeenCalled()
    expect(new Headers(f.fetcher.mock.calls[0]?.[1]?.headers).get(ACCOUNT_ID_HEADER)).toBe(
      'account-b',
    )

    const atom = pendingClient(false)
    atom.client.hydrateSession(payload('account-b'))
    const refresh = atom.client.useSession.get().refetch()
    await atom.waiting.promise
    atom.release.resolve(undefined)
    await refresh
    expect(atom.client.useSession.get().data?.user.id).toBe('account-b')
    expect(atom.client.useSession.get().error).toBeInstanceOf(Error)
  })
  it('allows anonymous discovery through both the SDK method and actual session atom', async () => {
    setOfflineUser(null)
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(Response.json(payload('account-a'))))
    const client = clientWithFetch(fetcher)
    const received = vi.fn()
    const result = await client.getSession({}, { onSuccess: received })
    expect(result.data?.user.id).toBe('account-a')
    expect(received).toHaveBeenCalledOnce()
    await client.useSession.get().refetch()
    expect(client.useSession.get().data?.user.id).toBe('account-a')
    expect(client.useSession.get().error).toBeNull()
    for (const [, options] of fetcher.mock.calls)
      expect(new Headers(options?.headers).has(ACCOUNT_ID_HEADER)).toBe(false)
  })
  it.each([
    'invalid-session',
    {},
    { user: null, session: {} },
    { user: {}, session: null },
    { user: { id: 7 }, session: { userId: 7 } },
    { user: { id: 'account-a' }, session: { userId: 'account-b' } },
  ])('rejects malformed session %j before callbacks or atom admission', async (data) => {
    setOfflineUser(null)
    const client = clientWithFetch(() => Promise.resolve(Response.json(data)))
    const received = vi.fn()
    await expect(client.getSession({}, { onSuccess: received })).rejects.toThrow(
      'session response is invalid',
    )
    expect(received).not.toHaveBeenCalled()
    await client.useSession.get().refetch()
    expect(client.useSession.get().data).toBeNull()
    expect(client.useSession.get().error).toBeInstanceOf(Error)
  })
  it.each([null, { user: null, session: null }])(
    'allows expired session %j to clear the actual SDK atom',
    async (data) => {
      setOfflineUser('account-b')
      const client = clientWithFetch(() => Promise.resolve(Response.json(data)))
      const received = vi.fn()
      client.hydrateSession(payload('account-b'))
      expect(client.useSession.get().data?.user.id).toBe('account-b')
      const result = await client.getSession({}, { onSuccess: received })
      expect(result.data).toEqual(data)
      expect(received).toHaveBeenCalledOnce()
      await client.useSession.get().refetch()
      expect(client.useSession.get().data).toBeNull()
      expect(client.useSession.get().error).toBeNull()
    },
  )
  it.each(['onRequest', 'onResponse', 'onSuccess', 'onError'] as const)(
    'rechecks account after an awaited %s callback returns',
    async (hook) => {
      setOfflineUser('account-a')
      const entered = Promise.withResolvers<undefined>()
      const release = Promise.withResolvers<undefined>()
      const callback = vi.fn(async () => {
        entered.resolve(undefined)
        await release.promise
      })
      const fetcher = vi.fn<typeof fetch>(() =>
        Promise.resolve(
          hook === 'onError'
            ? Response.json({ message: 'account-a-error-canary' }, { status: 403 })
            : Response.json(payload('account-a')),
        ),
      )
      const client = clientWithFetch(fetcher)
      const request = client.getSession({}, { [hook]: callback })
      await entered.promise
      setOfflineUser('account-b')
      release.resolve(undefined)
      await expect(request).rejects.toThrow('account changed')
      expect(callback).toHaveBeenCalledOnce()
      expect(fetcher).toHaveBeenCalledTimes(hook === 'onRequest' ? 0 : 1)
    },
  )
  it.each([false, true])(
    'fences a delayed retry decision when the account changed=%s',
    async (hasAccountChanged) => {
      setOfflineUser('account-a')
      const entered = Promise.withResolvers<undefined>()
      const release = Promise.withResolvers<undefined>()
      const retrying = vi.fn()
      const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementationOnce(() =>
          Promise.resolve(Response.json({ message: 'account-a-error-canary' }, { status: 503 })),
        )
        .mockImplementation(() => Promise.resolve(Response.json(payload('account-a'))))
      const client = clientWithFetch(fetcher)
      const request = client.getSession(
        {},
        {
          onRetry: retrying,
          retry: {
            type: 'linear',
            attempts: 1,
            delay: 0,
            async shouldRetry() {
              entered.resolve(undefined)
              await release.promise
              return true
            },
          },
        },
      )
      await entered.promise
      if (hasAccountChanged) setOfflineUser('account-b')
      release.resolve(undefined)
      if (hasAccountChanged) {
        await expect(request).rejects.toThrow('account changed')
        expect(retrying).not.toHaveBeenCalled()
        expect(fetcher).toHaveBeenCalledOnce()
      } else {
        const result = await request
        expect(result.data?.user.id).toBe('account-a')
        expect(retrying).toHaveBeenCalledOnce()
        expect(fetcher).toHaveBeenCalledTimes(2)
      }
    },
  )
})
