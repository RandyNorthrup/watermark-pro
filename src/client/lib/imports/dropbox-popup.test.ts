import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { acquireDropboxToken, saveToDropbox } from './dropbox-save'
import { ALL_CLOUD_CONFIG } from '../../test-support/cloud-config'
import { ACCOUNT_CHANGED_EVENT } from '../offline-account'
import { setOfflineUser } from '../offline-context'

beforeEach(() => {
  setOfflineUser('owner')
  vi.useFakeTimers()
  vi.spyOn(crypto.subtle, 'digest').mockResolvedValue(new ArrayBuffer(32))
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function popupFixture() {
  const popup = { closed: false, close: vi.fn(), location: new URL('about:blank') }
  const open = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)
  return { popup, open }
}

async function authorize(popup: ReturnType<typeof popupFixture>['popup']) {
  await vi.advanceTimersByTimeAsync(1)
  const state = popup.location.searchParams.get('state')
  popup.location = new URL(
    `${window.location.origin}/oauth/dropbox?code=allowed&state=${state ?? ''}`,
  )
  await vi.advanceTimersByTimeAsync(400)
}

async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    return await promise
  } catch (error) {
    return error
  }
}

describe('Dropbox popup lifecycle', () => {
  it('rejects a changed account after lazy export and never sends those bytes with the older token', async () => {
    const { popup } = popupFixture()
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ access_token: 'older-token' }))
    vi.stubGlobal('fetch', fetcher)
    const failure = failureOf(
      saveToDropbox(ALL_CLOUD_CONFIG, () => {
        setOfflineUser('other')
        return Promise.resolve([{ name: 'private.png', blob: new Blob(['private bytes']) }])
      }),
    )
    await authorize(popup)
    expect(await failure).toMatchObject({ message: expect.stringContaining('account changed') })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('runs the actual save wrapper, uploads at the app root, and returns the provider’s confirmed renamed identity', async () => {
    const { popup } = popupFixture()
    const blob = new Blob(['real file bytes'], { type: 'image/png' })
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ access_token: 'write-token' }))
      .mockResolvedValueOnce(Response.json({ id: 'id:saved-photo', name: 'photo (1).png' }))
    vi.stubGlobal('fetch', fetcher)
    const collect = vi.fn(() => Promise.resolve([{ name: 'photo.png', blob }]))
    const saving = saveToDropbox(ALL_CLOUD_CONFIG, collect)
    expect(collect).not.toHaveBeenCalled()
    await authorize(popup)
    expect(await saving).toEqual([
      {
        provider: 'dropbox',
        id: 'id:saved-photo',
        name: 'photo (1).png',
        manageUrl: 'https://www.dropbox.com/home/Apps/Lumafoil',
        userId: 'owner',
      },
    ])
    const upload = fetcher.mock.calls[1]?.[1]
    expect(upload?.body).toBe(blob)
    const headers = new Headers(upload?.headers)
    expect(headers.get('authorization')).toBe('Bearer write-token')
    expect(JSON.parse(headers.get('Dropbox-API-Arg') ?? '{}')).toMatchObject({
      path: '/photo.png',
      mode: 'add',
      autorename: true,
    })
  })

  it('reports a partial batch without claiming or sending later Dropbox files', async () => {
    const { popup } = popupFixture()
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ access_token: 'write-token' }))
      .mockResolvedValueOnce(Response.json({ id: 'id:first', name: 'first.png' }))
      .mockResolvedValueOnce(new Response(null, { status: 507 }))
    vi.stubGlobal('fetch', fetcher)
    const uploads = ['first.png', 'second.png', 'third.png'].map((name) => ({
      name,
      blob: new Blob([name]),
    }))
    const failure = failureOf(saveToDropbox(ALL_CLOUD_CONFIG, uploads))
    await authorize(popup)
    expect(await failure).toMatchObject({
      name: 'CloudBatchError',
      saved: [{ id: 'id:first' }],
      cause: { message: expect.stringContaining('second.png') },
    })
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('does not collect or upload files when the app account changes during Dropbox authorization', async () => {
    popupFixture()
    const collect = vi.fn(() =>
      Promise.resolve([{ name: 'private.png', blob: new Blob(['private']) }]),
    )
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const failure = failureOf(saveToDropbox(ALL_CLOUD_CONFIG, collect))
    await vi.advanceTimersByTimeAsync(1)
    setOfflineUser('other')
    window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT))
    expect(await failure).toMatchObject({ message: expect.stringContaining('account changed') })
    expect(collect).not.toHaveBeenCalled()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('opens synchronously, validates the returned state, and exchanges only the matching code', async () => {
    const { popup, open } = popupFixture()
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json({ access_token: 'short-lived' })),
    )
    vi.stubGlobal('fetch', fetcher)
    const token = acquireDropboxToken('app-key')
    expect(open).toHaveBeenCalledWith('about:blank', 'lumafoil-dropbox-oauth', expect.any(String))
    await vi.advanceTimersByTimeAsync(1)
    const state = popup.location.searchParams.get('state')
    expect(state?.length).toBeGreaterThan(30)
    popup.location = new URL(
      `${window.location.origin}/oauth/dropbox?code=allowed&state=${state ?? ''}`,
    )
    await vi.advanceTimersByTimeAsync(400)
    await expect(token).resolves.toBe('short-lived')
    expect(fetcher.mock.calls[0]?.[1]?.body).toBeInstanceOf(URLSearchParams)
    const body = fetcher.mock.calls[0]?.[1]?.body
    if (!(body instanceof URLSearchParams)) throw new Error('Expected form body')
    expect(body.get('code')).toBe('allowed')
    expect(popup.close).toHaveBeenCalled()
  })

  it('does not exchange a code with forged state', async () => {
    const { popup } = popupFixture()
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const result = failureOf(acquireDropboxToken('app-key'))
    await vi.advanceTimersByTimeAsync(1)
    popup.location = new URL(`${window.location.origin}/oauth/dropbox?code=wrong&state=forged`)
    await vi.advanceTimersByTimeAsync(400)
    expect(await result).toEqual(
      expect.objectContaining({ message: expect.stringContaining('state did not match') }),
    )
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('closes on account change, user cancellation, and timeout', async () => {
    const { popup } = popupFixture()
    let result = failureOf(acquireDropboxToken('app-key'))
    await vi.advanceTimersByTimeAsync(1)
    setOfflineUser('other')
    window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT))
    expect(await result).toEqual(
      expect.objectContaining({ message: expect.stringContaining('account changed') }),
    )
    expect(popup.close).toHaveBeenCalled()
    setOfflineUser('owner')
    result = failureOf(acquireDropboxToken('app-key'))
    await vi.advanceTimersByTimeAsync(1)
    popup.closed = true
    await vi.advanceTimersByTimeAsync(400)
    expect(await result).toEqual(
      expect.objectContaining({ message: expect.stringContaining('cancelled') }),
    )
    popup.closed = false
    result = failureOf(acquireDropboxToken('app-key'))
    await vi.advanceTimersByTimeAsync(120_001)
    expect(await result).toEqual(
      expect.objectContaining({ message: expect.stringContaining('timed out') }),
    )
  })

  it('reports popup blocking without making a provider request', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    await expect(acquireDropboxToken('app-key')).rejects.toThrow('allow pop-ups')
  })
})
