import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { acquireGraphToken, saveToOneDrive } from './onedrive'
import { ALL_CLOUD_CONFIG } from '../../test-support/cloud-config'
import { ACCOUNT_CHANGED_EVENT } from '../offline-account'
import { setOfflineUser } from '../offline-context'

const state = vi.hoisted(() => ({
  configurations: [] as unknown[],
  popup: vi.fn(),
  silent: vi.fn(),
  accounts: [] as { homeAccountId: string }[],
}))
vi.mock('@azure/msal-browser', () => ({
  InteractionRequiredAuthError: class extends Error {},
  PublicClientApplication: class {
    acquireTokenPopup = state.popup
    acquireTokenSilent = state.silent
    constructor(configuration: unknown) {
      state.configurations.push(configuration)
    }
    initialize() {
      return Promise.resolve()
    }
    getAllAccounts() {
      return state.accounts
    }
  },
}))
beforeEach(() => {
  setOfflineUser('owner')
  window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT))
  state.configurations.length = 0
  state.accounts = []
  state.popup.mockResolvedValue({ accessToken: 'popup-token' })
})
afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('OneDrive identity isolation', () => {
  it('runs the actual save wrapper through folder lookup and upload-session completion', async () => {
    const uploadUrl = 'https://sn3302.up.1drv.com/up/saved-session'
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id: 'folder', folder: {} }))
      .mockResolvedValueOnce(Response.json({ uploadUrl }))
      .mockResolvedValueOnce(
        Response.json(
          {
            id: 'saved-photo',
            name: 'photo (1).png',
            webUrl: 'https://onedrive.live.com/?id=saved-photo',
          },
          { status: 201 },
        ),
      )
    vi.stubGlobal('fetch', fetcher)
    const blob = new Blob(['photo bytes'], { type: 'image/png' })
    const collect = vi.fn(() => {
      expect(state.popup).toHaveBeenCalledOnce()
      return Promise.resolve([{ name: 'photo.png', blob }])
    })
    expect(await saveToOneDrive(ALL_CLOUD_CONFIG, collect)).toEqual([
      {
        provider: 'onedrive',
        id: 'saved-photo',
        name: 'photo (1).png',
        manageUrl: 'https://onedrive.live.com/?id=saved-photo',
        userId: 'owner',
      },
    ])
    expect(fetcher.mock.calls[1]?.[1]?.body).toContain(
      '"@microsoft.graph.conflictBehavior":"rename"',
    )
    const upload = fetcher.mock.calls[2]
    expect(upload?.[0]).toBe(uploadUrl)
    expect(new Headers(upload?.[1]?.headers).has('authorization')).toBe(false)
    expect(new Headers(upload?.[1]?.headers).get('content-range')).toBe('bytes 0-10/11')
    expect(collect).toHaveBeenCalledOnce()
  })

  it('keeps confirmed saves after a later OneDrive upload fails and stops the batch', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id: 'folder', folder: {} }))
      .mockResolvedValueOnce(Response.json({ uploadUrl: 'https://sn3302.up.1drv.com/up/first' }))
      .mockResolvedValueOnce(
        Response.json(
          {
            id: 'first-saved',
            name: 'first.png',
            webUrl: 'https://onedrive.live.com/?id=first-saved',
          },
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
    vi.stubGlobal('fetch', fetcher)
    const files = ['first.png', 'second.png', 'third.png'].map((name) => ({
      name,
      blob: new Blob([name]),
    }))
    await expect(saveToOneDrive(ALL_CLOUD_CONFIG, files)).rejects.toMatchObject({
      name: 'CloudBatchError',
      saved: [{ id: 'first-saved' }],
    })
    expect(fetcher).toHaveBeenCalledTimes(4)
  })

  it('rejects cancelled sign-in and an account changed during lazy export without uploading', async () => {
    const fetcher = vi.fn()
    const collect = vi.fn(() =>
      Promise.resolve([{ name: 'private.png', blob: new Blob(['private']) }]),
    )
    vi.stubGlobal('fetch', fetcher)
    state.popup.mockRejectedValueOnce(new Error('User cancelled sign-in'))
    await expect(saveToOneDrive(ALL_CLOUD_CONFIG, collect)).rejects.toThrow('cancelled')
    expect(collect).not.toHaveBeenCalled()
    await expect(
      saveToOneDrive(ALL_CLOUD_CONFIG, () => {
        setOfflineUser('other')
        return collect()
      }),
    ).rejects.toThrow('account changed')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('uses memory storage, requests account selection, and discards the instance on an app-account event', async () => {
    expect(await acquireGraphToken('client-id')).toBe('popup-token')
    expect(state.configurations[0]).toMatchObject({ cache: { cacheLocation: 'memoryStorage' } })
    expect(state.popup).toHaveBeenCalledWith({
      scopes: ['Files.ReadWrite'],
      prompt: 'select_account',
    })
    await acquireGraphToken('client-id')
    expect(state.configurations).toHaveLength(1)
    setOfflineUser('other')
    window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT))
    await acquireGraphToken('client-id')
    expect(state.configurations).toHaveLength(2)
  })

  it('can silently reuse only its current-account instance and refuses a late popup result', async () => {
    state.accounts = [{ homeAccountId: 'cloud-account' }]
    state.silent.mockResolvedValue({ accessToken: 'silent-token' })
    expect(await acquireGraphToken('client-id')).toBe('silent-token')
    expect(state.popup).not.toHaveBeenCalled()
    state.accounts = []
    state.popup.mockImplementationOnce(() => {
      setOfflineUser('other')
      return Promise.resolve({ accessToken: 'old-owner-token' })
    })
    await expect(acquireGraphToken('client-id')).rejects.toThrow('account changed')
  })
})
