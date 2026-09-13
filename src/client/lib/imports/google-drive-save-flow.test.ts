import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { saveToGoogleDrive } from './google-drive-save'
import { ALL_CLOUD_CONFIG } from '../../test-support/cloud-config'
import { cloudToken } from '../cloud-connections'
import { ACCOUNT_CHANGED_EVENT } from '../offline-account'
import { setOfflineUser } from '../offline-context'

vi.mock('../cloud-connections', () => ({ cloudToken: vi.fn() }))
const TOKEN = {
  accessToken: 'provider-token',
  expiresAt: '2030-01-01T00:00:00.000Z',
  providerAccountId: 'cloud-account',
  generation: 1,
}
const uploads = [
  { name: 'first.png', blob: new Blob(['FIRST IMAGE'], { type: 'image/png' }) },
  { name: 'second.png', blob: new Blob(['SECOND IMAGE'], { type: 'image/png' }) },
  { name: 'third.png', blob: new Blob(['THIRD IMAGE'], { type: 'image/png' }) },
]

beforeEach(() => {
  setOfflineUser('owner')
  vi.mocked(cloudToken).mockReset().mockResolvedValue(TOKEN)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('actual Google Drive save entry point', () => {
  it('gets the saved grant before lazy export, creates a missing folder, and returns confirmed upload identities', async () => {
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
      expect(cloudToken).toHaveBeenCalled()
      return Promise.resolve(uploads.slice(0, 2))
    })
    const saved = await saveToGoogleDrive(ALL_CLOUD_CONFIG, collect)
    expect(saved).toEqual([
      {
        provider: 'google',
        id: 'saved-1',
        name: 'first.png',
        userId: 'owner',
        providerAccountId: 'cloud-account',
        manageUrl: 'https://drive.google.com/file/d/saved-1/view',
      },
      {
        provider: 'google',
        id: 'saved-2',
        name: 'second.png',
        userId: 'owner',
        providerAccountId: 'cloud-account',
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
    vi.mocked(cloudToken).mockRejectedValueOnce(new Error('Connection cancelled'))
    const fetcher = vi.fn()
    const collect = vi.fn(() => Promise.resolve(uploads))
    vi.stubGlobal('fetch', fetcher)
    await expect(saveToGoogleDrive(ALL_CLOUD_CONFIG, collect)).rejects.toThrow('cancelled')
    expect(collect).not.toHaveBeenCalled()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('rejects a stale token callback and a stale lazy export before any provider mutation', async () => {
    const pending = Promise.withResolvers<typeof TOKEN>()
    vi.mocked(cloudToken).mockReturnValueOnce(pending.promise)
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const saving = expect(saveToGoogleDrive(ALL_CLOUD_CONFIG, uploads)).rejects.toThrow(
      'account changed',
    )
    await vi.waitFor(() => expect(cloudToken).toHaveBeenCalled())
    setOfflineUser('other')
    window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT))
    pending.resolve(TOKEN)
    await saving
    setOfflineUser('owner')
    vi.mocked(cloudToken).mockResolvedValue(TOKEN)
    await expect(
      saveToGoogleDrive(ALL_CLOUD_CONFIG, () => {
        setOfflineUser('other')
        return Promise.resolve(uploads)
      }),
    ).rejects.toThrow('account changed')
    expect(fetcher).not.toHaveBeenCalled()
  })
})
