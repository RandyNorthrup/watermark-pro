/** Exercise account hooks through the installed Better Fetch pipeline, including response body delays. */
import { createAuthClient } from 'better-auth/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createAuthAccountHooks, withAuthAccountBoundary } from './auth-account'
import { setOfflineUser } from './offline-context'
import { ACCOUNT_ID_HEADER } from '../../shared/account-identity'

const OWNER = 'account-a'
beforeEach(() => setOfflineUser(OWNER))
afterEach(() => setOfflineUser(null))

function authFetch(fetcher: typeof fetch) {
  return withAuthAccountBoundary(
    createAuthClient({
      baseURL: `${window.location.origin}/api/auth`,
      fetchOptions: { customFetchImpl: fetcher, ...createAuthAccountHooks() },
    }),
  ).$fetch
}

describe('Better Auth account ownership', () => {
  it.each([
    '/organization/list',
    '/organization/invite-member',
    '/admin/list-users',
    '/list-accounts',
    '/link-social',
    '/sign-out',
  ])('binds %s to the rendered account', async (path) => {
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(Response.json({ ok: true })))
    const request = authFetch(fetcher)
    await request(path)
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get(ACCOUNT_ID_HEADER)).toBe(OWNER)
  })
  it.each(['/sign-in/email', '/sign-up/email', '/callback/google'])(
    'allows %s to discover the live identity without an old account header',
    async (path) => {
      const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(Response.json({ ok: true })))
      await authFetch(fetcher)(path)
      expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).has(ACCOUNT_ID_HEADER)).toBe(false)
    },
  )
  it('binds known-owner session validation while permitting an expired null session', async () => {
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(Response.json(null)))
    await authFetch(fetcher)('/get-session')
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get(ACCOUNT_ID_HEADER)).toBe(OWNER)
  })
  it('rejects a stale organization response before Better Auth can cache it', async () => {
    const result = Promise.withResolvers<Response>()
    const called = Promise.withResolvers<undefined>()
    const fetcher = vi.fn<typeof fetch>(() => {
      called.resolve(undefined)
      return result.promise
    })
    const response = authFetch(fetcher)('/organization/get-full-organization')
    await called.promise
    setOfflineUser('account-b')
    result.resolve(Response.json({ private: 'account-a-canary' }))
    await expect(response).rejects.toThrow('account changed')
  })
  it('checks ownership again after a slow response body has been decoded', async () => {
    const body = Promise.withResolvers<undefined>()
    const reading = Promise.withResolvers<undefined>()
    const payload = Response.json({ private: 'account-a-canary' })
    vi.spyOn(payload, 'text').mockImplementation(async () => {
      reading.resolve(undefined)
      await body.promise
      return '{"private":"account-a-canary"}'
    })
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(payload))
    const response = authFetch(fetcher)('/organization/list')
    await reading.promise
    setOfflineUser('account-b')
    body.resolve(undefined)
    await expect(response).rejects.toThrow('account changed')
  })
})

it.each([
  '/organization/list',
  '/organization/accept-invitation',
  '/admin/list-users',
  '/link-social',
  '/list-accounts',
  '/sign-out',
  '/sign-out/',
])('refuses unbound authenticated %s calls before transport', async (path) => {
  const fetcher = vi.fn<typeof fetch>(() =>
    Promise.resolve(Response.json({ private: 'other-account-canary' })),
  )
  setOfflineUser(null)
  await expect(authFetch(fetcher)(path)).rejects.toThrow('Sign in before')
  expect(fetcher).not.toHaveBeenCalled()
})

it('allows locked identity discovery without retaining caller-supplied account metadata', async () => {
  const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(Response.json(null)))
  setOfflineUser(null)
  await authFetch(fetcher)('/get-session', { headers: { [ACCOUNT_ID_HEADER]: OWNER } })
  expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).has(ACCOUNT_ID_HEADER)).toBe(false)
})

it('refuses a stale explicit request owner after another account becomes active', async () => {
  const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(Response.json({ ok: true })))
  setOfflineUser('account-b')
  await expect(
    authFetch(fetcher)('/organization/list', { headers: { [ACCOUNT_ID_HEADER]: OWNER } }),
  ).rejects.toThrow('account changed')
  expect(fetcher).not.toHaveBeenCalled()
})
