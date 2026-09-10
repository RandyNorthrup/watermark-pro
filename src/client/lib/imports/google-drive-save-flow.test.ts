import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { saveToGoogleDrive } from './google-drive-save'
import { ALL_CLOUD_CONFIG } from '../../test-support/cloud-config'
import { ACCOUNT_CHANGED_EVENT } from '../offline-account'
import { setOfflineUser } from '../offline-context'

type TokenOptions = Parameters<
  NonNullable<Window['google']>['accounts']['oauth2']['initTokenClient']
>[0]
const sdk: { mode: 'grant' | 'cancel' | 'hold'; request: TokenOptions | null } = {
  mode: 'grant',
  request: null,
}
const uploads = [
  { name: 'first.png', blob: new Blob(['FIRST IMAGE'], { type: 'image/png' }) },
  { name: 'second.png', blob: new Blob(['SECOND IMAGE'], { type: 'image/png' }) },
  { name: 'third.png', blob: new Blob(['THIRD IMAGE'], { type: 'image/png' }) },
]

beforeEach(() => {
  setOfflineUser('owner')
  sdk.mode = 'grant'
  sdk.request = null
  const append = document.head.append.bind(document.head)
  vi.spyOn(document.head, 'append').mockImplementation((...nodes) => {
    append(...nodes)
    for (const node of nodes)
      if (node instanceof HTMLScriptElement)
        queueMicrotask(() => node.dispatchEvent(new Event('load')))
  })
  Object.assign(window, {
    google: {
      accounts: {
        oauth2: {
          initTokenClient(options: TokenOptions) {
            sdk.request = options
            return {
              requestAccessToken(request: { prompt: string }) {
                expect(request.prompt).toBe('select_account')
                if (sdk.mode === 'grant')
                  queueMicrotask(() => options.callback({ access_token: 'provider-token' }))
                else if (sdk.mode === 'cancel')
                  queueMicrotask(() => options.error_callback({ type: 'popup_closed' }))
              },
            }
          },
        },
      },
    },
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete window.google
})

describe('actual Google Drive save entry point', () => {
  it('runs GIS before lazy export, creates a missing folder, and returns confirmed upload identities', async () => {
    const bodies: string[] = []
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer provider-token')
      expect(init).toMatchObject({
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
      })
      const address = url instanceof Request ? url.url : url.toString()
      if (address.includes('/upload/')) {
        if (!(init?.body instanceof Blob)) throw new Error('Expected multipart bytes')
        bodies.push(await init.body.text())
        return Response.json({ id: `saved-${String(bodies.length)}` })
      }
      return Response.json(init?.method === 'POST' ? { id: 'created-folder' } : { files: [] })
    })
    vi.stubGlobal('fetch', fetcher)
    const collect = vi.fn(() => {
      expect(sdk.request?.client_id).toBe(ALL_CLOUD_CONFIG.googleOAuthClientId)
      expect(sdk.request?.scope).toBe('https://www.googleapis.com/auth/drive.file')
      return Promise.resolve(uploads.slice(0, 2))
    })
    const saved = await saveToGoogleDrive(ALL_CLOUD_CONFIG, collect)
    expect(saved).toEqual([
      {
        provider: 'google',
        id: 'saved-1',
        name: 'first.png',
        userId: 'owner',
        manageUrl: 'https://drive.google.com/file/d/saved-1/view',
      },
      {
        provider: 'google',
        id: 'saved-2',
        name: 'second.png',
        userId: 'owner',
        manageUrl: 'https://drive.google.com/file/d/saved-2/view',
      },
    ])
    expect(collect).toHaveBeenCalledOnce()
    expect(fetcher).toHaveBeenCalledTimes(4)
    expect(bodies[0]).toContain('"parents":["created-folder"]')
    expect(bodies[0]).toContain('FIRST IMAGE')
    expect(bodies[1]).toContain('SECOND IMAGE')
  })

  it('keeps only the first confirmed file when the next upload fails and never sends the third', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ files: [{ id: 'existing-folder' }] }))
      .mockResolvedValueOnce(Response.json({ id: 'first-saved' }))
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
    vi.stubGlobal('fetch', fetcher)
    await expect(saveToGoogleDrive(ALL_CLOUD_CONFIG, uploads)).rejects.toMatchObject({
      name: 'CloudBatchError',
      saved: [{ id: 'first-saved', name: 'first.png' }],
      cause: { message: expect.stringContaining('second.png') },
    })
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('does not export or upload after popup cancellation', async () => {
    sdk.mode = 'cancel'
    const fetcher = vi.fn()
    const collect = vi.fn(() => Promise.resolve(uploads))
    vi.stubGlobal('fetch', fetcher)
    await expect(saveToGoogleDrive(ALL_CLOUD_CONFIG, collect)).rejects.toThrow('cancelled')
    expect(collect).not.toHaveBeenCalled()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('rejects a stale token callback and a stale lazy export before any provider mutation', async () => {
    sdk.mode = 'hold'
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const saving = expect(saveToGoogleDrive(ALL_CLOUD_CONFIG, uploads)).rejects.toThrow(
      'account changed',
    )
    await vi.waitFor(() => expect(sdk.request).not.toBeNull())
    setOfflineUser('other')
    window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT))
    sdk.request?.callback({ access_token: 'stale-token' })
    await saving
    setOfflineUser('owner')
    sdk.mode = 'grant'
    await expect(
      saveToGoogleDrive(ALL_CLOUD_CONFIG, () => {
        setOfflineUser('other')
        return Promise.resolve(uploads)
      }),
    ).rejects.toThrow('account changed')
    expect(fetcher).not.toHaveBeenCalled()
  })
})
