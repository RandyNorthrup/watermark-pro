import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { notifyCloudConnectionChanged } from './cloud-connection-context'
import { cloudToken, connectCloudProvider, disconnectCloudProvider } from './cloud-connections'
import { setOfflineUser } from './offline-context'
import { ACCOUNT_ID_HEADER } from '../../shared/account-identity'

const ATTEMPT = '11111111-1111-4111-8111-111111111111'
const TOKEN = {
  accessToken: 'short-lived-access',
  expiresAt: '2030-01-01T00:00:00.000Z',
  providerAccountId: 'cloud-account',
  generation: 1,
}

beforeEach(() => setOfflineUser('cloud-user'))
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  setOfflineUser(null)
})

function popup() {
  const child = { closed: false, close: vi.fn(), location: { href: 'about:blank' } }
  const open = vi.spyOn(window, 'open').mockReturnValue(child as unknown as Window)
  return { child, open }
}

function attempt(
  authorizationUrl = 'https://accounts.google.com/o/oauth2/v2/auth?state=opaque-state',
) {
  return { id: ATTEMPT, authorizationUrl, expiresAt: new Date(Date.now() + 60_000).toISOString() }
}

describe('durable cloud connection client', () => {
  it('expires an unfinished popup and confirms server cancellation even when COOP prevents closing it', async () => {
    const { child } = popup()
    child.close.mockImplementation(() => {
      throw new DOMException('Severed popup', 'SecurityError')
    })
    const expiresAt = new Date(Date.now() - 1).toISOString()
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ ...attempt(), expiresAt }))
      .mockResolvedValueOnce(Response.json({ cancelled: true }))
    vi.stubGlobal('fetch', fetcher)
    await expect(connectCloudProvider('google')).rejects.toThrow('connection expired')
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls[1]?.[0]).toBe(`/api/me/cloud/attempts/${ATTEMPT}/cancel`)
  })

  it('normalizes a caller-supplied cancellation reason while waiting for an authoritative refresh', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ isRefreshing: true, retryAfterMs: 1000 }))
    vi.stubGlobal('fetch', fetcher)
    const pending = expect(cloudToken('google', controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
    await vi.advanceTimersByTimeAsync(1)
    controller.abort('User cancelled this operation')
    await pending
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('reserves Connect popup before async work and accepts only server-confirmed success even when COOP severs the handle', async () => {
    const { child, open } = popup()
    child.closed = true
    const initial = Promise.withResolvers<Response>()
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockReturnValueOnce(initial.promise)
      .mockResolvedValueOnce(
        Response.json({ status: 'connected', expiresAt: '2030-01-01T00:00:00.000Z' }),
      )
    vi.stubGlobal('fetch', fetch)
    const connected = connectCloudProvider('google')
    expect(open).toHaveBeenCalledOnce()
    expect(child.location.href).toBe('about:blank')
    initial.resolve(Response.json(attempt()))
    await connected
    expect(child.location.href).toContain('https://accounts.google.com/')
    expect(child.close).toHaveBeenCalledOnce()
    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      '/api/me/cloud/google/connect',
      `/api/me/cloud/attempts/${ATTEMPT}`,
    ])
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get(ACCOUNT_ID_HEADER)).toBe('cloud-user')
    expect(localStorage.length).toBe(0)
  })

  it('reuses a stored grant, waits for another server refresh, and opens no OAuth popup', async () => {
    vi.useFakeTimers()
    const { open } = popup()
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ isRefreshing: true, retryAfterMs: 1000 }))
      .mockResolvedValueOnce(Response.json(TOKEN))
    vi.stubGlobal('fetch', fetch)
    const pending = cloudToken('google')
    await vi.advanceTimersByTimeAsync(1000)
    expect(await pending).toEqual(TOKEN)
    expect(open).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('rejects a foreign authorization destination and cancels its server attempt', async () => {
    const { child } = popup()
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        Response.json(attempt('https://accounts.google.com.attacker.example/auth')),
      )
      .mockResolvedValueOnce(Response.json({ cancelled: true }))
    vi.stubGlobal('fetch', fetch)
    await expect(connectCloudProvider('google')).rejects.toThrow(
      'Unexpected cloud authorization destination',
    )
    expect(child.location.href).toBe('about:blank')
    expect(fetch.mock.calls[1]?.[0]).toBe(`/api/me/cloud/attempts/${ATTEMPT}/cancel`)
  })

  it('cancels on an explicit abort without leaving the provider attempt reusable', async () => {
    vi.useFakeTimers()
    const { child } = popup()
    const controller = new AbortController()
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json(attempt()))
      .mockResolvedValueOnce(
        Response.json({ status: 'pending', expiresAt: '2030-01-01T00:00:00.000Z' }),
      )
      .mockResolvedValueOnce(Response.json({ cancelled: true }))
    vi.stubGlobal('fetch', fetch)
    const pending = expect(connectCloudProvider('google', controller.signal)).rejects.toMatchObject(
      { name: 'AbortError' },
    )
    await vi.advanceTimersByTimeAsync(1)
    controller.abort()
    await pending
    expect(child.close).toHaveBeenCalledOnce()
    expect(fetch.mock.calls.at(-1)?.[0]).toBe(`/api/me/cloud/attempts/${ATTEMPT}/cancel`)
  })

  it('reports cancellation persistence failure instead of pretending the connection was cancelled', async () => {
    popup()
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json(attempt()))
      .mockResolvedValueOnce(
        Response.json({ status: 'failed', expiresAt: '2030-01-01T00:00:00.000Z' }),
      )
      .mockRejectedValueOnce(new TypeError('Offline'))
    vi.stubGlobal('fetch', fetch)
    await expect(connectCloudProvider('google')).rejects.toThrow(
      'cancellation could not be confirmed',
    )
  })

  it('rejects stale app/provider results and performs no implicit reauthorization on server refusal', async () => {
    const first = Promise.withResolvers<Response>()
    const fetch = vi.fn<typeof globalThis.fetch>().mockReturnValueOnce(first.promise)
    vi.stubGlobal('fetch', fetch)
    const pending = expect(cloudToken('google')).rejects.toThrow('cloud connection changed')
    notifyCloudConnectionChanged()
    first.resolve(Response.json(TOKEN))
    await pending
    fetch.mockResolvedValueOnce(Response.json({ error: 'conflict' }, { status: 409 }))
    const { open } = popup()
    await expect(cloudToken('google')).rejects.toMatchObject({ status: 409 })
    expect(open).not.toHaveBeenCalled()
    fetch.mockResolvedValueOnce(Response.json({ disconnected: true, providerRevoked: false }))
    expect(await disconnectCloudProvider('onedrive')).toEqual({
      disconnected: true,
      providerRevoked: false,
    })
  })

  it('refuses popup blocking before creating a server attempt', async () => {
    const { open } = popup()
    open.mockReturnValue(null)
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(connectCloudProvider('google')).rejects.toThrow('Allow popups')
    expect(fetch).not.toHaveBeenCalled()
  })
})
