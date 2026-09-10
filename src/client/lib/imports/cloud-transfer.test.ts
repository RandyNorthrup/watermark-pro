import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CloudBatchError,
  cloudFileName,
  cloudRequest,
  trustedCloudUrl,
  uploadCloudBatch,
  type CloudSavedFile,
} from './cloud-transfer'
import type { CloudUpload } from './source'
import { ACCOUNT_CHANGED_EVENT } from '../offline-account'
import { setOfflineUser } from '../offline-context'

const SAVED: CloudSavedFile = {
  provider: 'google',
  id: 'file1',
  name: 'one.png',
  manageUrl: 'https://drive.google.com/file/d/file1/view',
  userId: 'one',
}
beforeEach(() => setOfflineUser('one'))
afterEach(() => vi.unstubAllGlobals())

describe('cloud account and transfer boundary', () => {
  it('returns every confirmed file in upload order after a complete batch', async () => {
    const second = { ...SAVED, id: 'file2', name: 'two.png' }
    const uploader = vi
      .fn<(file: CloudUpload) => Promise<CloudSavedFile>>()
      .mockResolvedValueOnce(SAVED)
      .mockResolvedValueOnce(second)
    const files = [
      { name: 'one.png', blob: new Blob(['one']) },
      { name: 'two.png', blob: new Blob(['two']) },
    ]
    expect(await uploadCloudBatch(files, uploader)).toEqual([SAVED, second])
    expect(uploader.mock.calls.map((call) => call[0])).toEqual(files)
  })
  it('accepts actual provider subdomains and refuses credentials, lookalikes, HTTP and file paths', () => {
    expect(trustedCloudUrl('https://tenant.sharepoint.com/file', ['sharepoint.com'])).toBe(
      'https://tenant.sharepoint.com/file',
    )
    const insecure = new URL('https://tenant.sharepoint.com/file')
    insecure.protocol = 'http:'
    for (const url of [
      insecure.href,
      'https://sharepoint.com.attacker.test/file',
      'https://user:secret@tenant.sharepoint.com/file',
      'https://tenant.sharepoint.com:444/file',
    ])
      expect(() => trustedCloudUrl(url, ['sharepoint.com'])).toThrow()
    expect(cloudFileName('café photo.png')).toBe('café photo.png')
    for (const name of ['../photo.jpg', '..', String.raw`folder\photo.jpg`, 'a\n.jpg'])
      expect(() => cloudFileName(name)).toThrow()
  })

  it('does not expose a body read after switching away and back to the original account', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ secret: 'original' }))),
    )
    await expect(
      cloudRequest('https://drive.google.com/file', {}, async (response) => {
        const result: unknown = await response.json()
        setOfflineUser('two')
        setOfflineUser('one')
        return result
      }),
    ).rejects.toThrow('account changed')
  })

  it('keeps private provider responses out of the HTTP cache and sends no browser cookies or referrer', async () => {
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(new Response('private bytes')))
    vi.stubGlobal('fetch', fetcher)
    expect(
      await cloudRequest(
        'https://graph.microsoft.com/v1.0/file',
        { headers: { Authorization: 'Bearer provider-token' } },
        (response) => response.text(),
      ),
    ).toBe('private bytes')
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { Authorization: 'Bearer provider-token' },
    })
  })

  it('aborts a pending HTTP request on the app account event', async () => {
    const fetcher = vi.fn<typeof fetch>((_url, init) => {
      window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT))
      expect(init?.signal?.aborted).toBe(true)
      return Promise.reject(new DOMException('Aborted', 'AbortError'))
    })
    vi.stubGlobal('fetch', fetcher)
    await expect(
      cloudRequest('https://drive.google.com/file', {}, (response) => response.text()),
    ).rejects.toThrow('Aborted')
  })

  it('retains confirmed saves on failure and does not submit later files', async () => {
    const uploads = ['one.png', 'two.png', 'three.png'].map((name) => ({
      name,
      blob: new Blob([name]),
    }))
    const uploader = vi.fn().mockResolvedValueOnce(SAVED).mockRejectedValueOnce(new Error('quota'))
    let result: unknown
    try {
      await uploadCloudBatch(uploads, uploader)
    } catch (error) {
      result = error
    }
    expect(result).toBeInstanceOf(CloudBatchError)
    if (!(result instanceof CloudBatchError)) throw new Error('Expected partial save failure')
    expect(result.saved).toEqual([SAVED])
    expect(result.message).toContain('1 of 3')
    expect(uploader).toHaveBeenCalledTimes(2)
  })

  it('does not expose old-account partial results or run another upload after switching', async () => {
    const uploader = vi.fn(() => {
      setOfflineUser('two')
      return Promise.resolve(SAVED)
    })
    await expect(
      uploadCloudBatch(
        [
          { name: 'one', blob: new Blob() },
          { name: 'two', blob: new Blob() },
        ],
        uploader,
      ),
    ).rejects.toThrow('account changed')
    expect(uploader).toHaveBeenCalledOnce()
  })
})
