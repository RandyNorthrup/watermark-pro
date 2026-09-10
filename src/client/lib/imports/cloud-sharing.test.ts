import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createCloudShare, revokeCloudShare } from './cloud-sharing'
import type { CloudSavedFile } from './cloud-transfer'
import { acquireDropboxToken } from './dropbox-save'
import { acquireGoogleDriveToken } from './google-picker'
import { acquireGraphToken } from './onedrive'
import type { CloudProviderId } from './source'
import { ALL_CLOUD_CONFIG } from '../../test-support/cloud-config'
import { setOfflineUser } from '../offline-context'

vi.mock('./google-picker', () => ({ acquireGoogleDriveToken: vi.fn() }))
vi.mock('./dropbox-save', () => ({ acquireDropboxToken: vi.fn() }))
vi.mock('./onedrive', () => ({ acquireGraphToken: vi.fn() }))

function file(provider: CloudProviderId): CloudSavedFile {
  return {
    provider,
    id: 'file-one',
    name: 'photo.png',
    manageUrl: 'https://drive.google.com/file/d/file-one/view',
    userId: 'owner',
  }
}
beforeEach(() => {
  setOfflineUser('owner')
  vi.mocked(acquireGoogleDriveToken).mockResolvedValue('google-token')
  vi.mocked(acquireDropboxToken).mockResolvedValue('dropbox-token')
  vi.mocked(acquireGraphToken).mockResolvedValue('microsoft-token')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('explicit native cloud links', () => {
  it('reports failed revocation without claiming the link was disabled', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(null, { status: 403 }))),
    )
    await expect(
      revokeCloudShare(ALL_CLOUD_CONFIG, file('google'), {
        url: file('google').manageUrl,
        permissionId: 'permission',
      }),
    ).rejects.toThrow('could not revoke')
  })

  it('rejects missing provider configuration before making a request', async () => {
    await expect(
      createCloudShare({ ...ALL_CLOUD_CONFIG, googleOAuthClientId: null }, file('google')),
    ).rejects.toThrow('not configured')
    expect(acquireGoogleDriveToken).not.toHaveBeenCalled()
  })
  it('creates a non-discoverable Google view link and revokes only its permission', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id: 'permission-one' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetcher)
    const saved = file('google')
    const link = await createCloudShare(ALL_CLOUD_CONFIG, saved)
    expect(link).toEqual({ url: saved.manageUrl, permissionId: 'permission-one' })
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ type: 'anyone', role: 'reader', allowFileDiscovery: false }),
    })
    await revokeCloudShare(ALL_CLOUD_CONFIG, saved, link)
    expect(fetcher.mock.calls[1]?.[0]).toBe(
      'https://www.googleapis.com/drive/v3/files/file-one/permissions/permission-one',
    )
    expect(fetcher.mock.calls[1]?.[1]?.method).toBe('DELETE')
  })

  it('creates and revokes a Dropbox link without deleting the file', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ url: 'https://www.dropbox.com/scl/fi/one/photo.png?rlkey=abc' }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetcher)
    const saved = file('dropbox')
    const link = await createCloudShare(ALL_CLOUD_CONFIG, saved)
    expect(fetcher.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ path: saved.id, settings: { requested_visibility: 'public' } }),
    )
    await revokeCloudShare(ALL_CLOUD_CONFIG, saved, link)
    expect(fetcher.mock.calls[1]?.[0]).toBe(
      'https://api.dropboxapi.com/2/sharing/revoke_shared_link',
    )
    expect(fetcher.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ url: link.url }))
  })

  it('reuses only the exact Dropbox file link when one already exists', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 409 }))
      .mockResolvedValueOnce(
        Response.json({
          links: [
            { id: 'other', url: 'https://www.dropbox.com/s/other' },
            { id: 'file-one', url: 'https://www.dropbox.com/s/one' },
          ],
        }),
      )
    vi.stubGlobal('fetch', fetcher)
    expect(await createCloudShare(ALL_CLOUD_CONFIG, file('dropbox'))).toMatchObject({
      url: 'https://www.dropbox.com/s/one',
    })
    expect(fetcher.mock.calls[1]?.[1]?.body).toBe(
      JSON.stringify({ path: 'file-one', direct_only: true }),
    )
  })

  it('creates a read-only anonymous OneDrive link and revokes its exact permission', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          id: 'permission-one',
          link: { type: 'view', scope: 'anonymous', webUrl: 'https://1drv.ms/i/one' },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetcher)
    const saved = file('onedrive')
    const link = await createCloudShare(ALL_CLOUD_CONFIG, saved)
    expect(fetcher.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ type: 'view', scope: 'anonymous' }),
    )
    await revokeCloudShare(ALL_CLOUD_CONFIG, saved, link)
    expect(fetcher.mock.calls[1]?.[0]).toBe(
      'https://graph.microsoft.com/v1.0/me/drive/items/file-one/permissions/permission-one',
    )
  })

  it('rejects foreign app-account files before authentication and unsafe provider links', async () => {
    await expect(
      createCloudShare(ALL_CLOUD_CONFIG, { ...file('google'), userId: 'someone-else' }),
    ).rejects.toThrow('another app account')
    expect(acquireGoogleDriveToken).not.toHaveBeenCalled()
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(Response.json({ url: 'https://www.dropbox.com.attacker.test/file' })),
      ),
    )
    await expect(createCloudShare(ALL_CLOUD_CONFIG, file('dropbox'))).rejects.toThrow(
      'unexpected URL',
    )
  })

  it('surfaces provider policy restrictions and suppresses actions after an account switch', async () => {
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status: 403 })))
    vi.stubGlobal('fetch', fetcher)
    await expect(createCloudShare(ALL_CLOUD_CONFIG, file('onedrive'))).rejects.toThrow(
      'restrict anonymous sharing',
    )
    vi.mocked(acquireGoogleDriveToken).mockImplementationOnce(() => {
      setOfflineUser('other')
      return Promise.resolve('old-token')
    })
    await expect(createCloudShare(ALL_CLOUD_CONFIG, file('google'))).rejects.toThrow(
      'account changed',
    )
    expect(fetcher).toHaveBeenCalledOnce()
  })
})
