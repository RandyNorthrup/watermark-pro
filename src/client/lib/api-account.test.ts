/** Private API calls bind the rendered account to the cookie the server will actually receive. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { apiRequest, fetchJson } from './api'
import { setOfflineUser } from './offline-context'
import { ACCOUNT_ID_HEADER } from '../../shared/account-identity'

const OWNER = 'rendered-account'
beforeEach(() => setOfflineUser(OWNER))
afterEach(() => {
  setOfflineUser(null)
  vi.unstubAllGlobals()
})

describe('account-bound API requests', () => {
  it.each(['/api/orgs/studio/photos', '/api/me/invitations', '/api/admin/accounts?period=week'])(
    'binds %s to the rendered account',
    async (path) => {
      const fetcher = vi.fn((_path: string, _init?: RequestInit) =>
        Promise.resolve(Response.json({ ok: true })),
      )
      vi.stubGlobal('fetch', fetcher)
      await apiRequest(path, {
        method: 'POST',
        headers: { [ACCOUNT_ID_HEADER]: OWNER },
      })
      expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get(ACCOUNT_ID_HEADER)).toBe(OWNER)
    },
  )
  it.each(['/api/config', '/api/auth/get-session', '/api/meow/status'])(
    'does not add account metadata to %s',
    async (path) => {
      const fetcher = vi.fn((_path: string, _init?: RequestInit) =>
        Promise.resolve(Response.json({ ok: true })),
      )
      vi.stubGlobal('fetch', fetcher)
      await apiRequest(path)
      expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).has(ACCOUNT_ID_HEADER)).toBe(false)
    },
  )
  it('does not deliver a completed private response to a newly signed-in account', async () => {
    const transport = Promise.withResolvers<Response>()
    vi.stubGlobal(
      'fetch',
      vi.fn(() => transport.promise),
    )
    const response = fetchJson('/api/me/invitations', z.object({ private: z.string() }))
    setOfflineUser('new-account')
    transport.resolve(Response.json({ private: 'old-account-canary' }))
    await expect(response).rejects.toThrow('account changed')
  })
})

it.each([
  '/api/orgs/studio/photos',
  '/api/me/invitations',
  '/api/admin/accounts',
  '/alias/../api/me/invitations',
])('rejects an unbound private callback for %s before a new cookie can be used', async (path) => {
  const fetcher = vi.fn<typeof fetch>(() =>
    Promise.resolve(Response.json({ private: 'new-account-canary' })),
  )
  vi.stubGlobal('fetch', fetcher)
  setOfflineUser(null)
  await expect(apiRequest(path, { method: 'POST' })).rejects.toThrow('Sign in before')
  expect(fetcher).not.toHaveBeenCalled()
})

it('does not substitute a new owner for an explicit old request owner or send private requests to another site', async () => {
  const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(Response.json({ ok: true })))
  vi.stubGlobal('fetch', fetcher)
  setOfflineUser('new-account')
  await expect(
    apiRequest('/api/me/invitations', { headers: { [ACCOUNT_ID_HEADER]: OWNER } }),
  ).rejects.toThrow('account changed')
  await expect(apiRequest('https://foreign.example/api/me/invitations')).rejects.toThrow(
    'stay on this site',
  )
  expect(fetcher).not.toHaveBeenCalled()
})

it('allows locked public identity/config requests and strips an old owner header', async () => {
  const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(Response.json({ ok: true })))
  vi.stubGlobal('fetch', fetcher)
  setOfflineUser(null)
  for (const path of ['/api/config', '/api/auth/get-session'])
    await apiRequest(path, { headers: { [ACCOUNT_ID_HEADER]: OWNER } })
  expect(fetcher).toHaveBeenCalledTimes(2)
  for (const [, init] of fetcher.mock.calls)
    expect(new Headers(init?.headers).has(ACCOUNT_ID_HEADER)).toBe(false)
})
