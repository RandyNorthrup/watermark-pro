import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { saveToDropbox } from './dropbox-save'
import { saveToOneDrive } from './onedrive'
import { ALL_CLOUD_CONFIG } from '../../test-support/cloud-config'
import { cloudToken } from '../cloud-connections'
import { setOfflineUser } from '../offline-context'

vi.mock('../cloud-connections', () => ({ cloudToken: vi.fn() }))
const TOKEN = {
  accessToken: 'provider-token',
  expiresAt: '2030-01-01T00:00:00.000Z',
  providerAccountId: 'cloud-account',
  generation: 1,
}
const TARGET = {
  folder: { id: 'folder', name: 'Originals', path: '/originals' },
  providerAccountId: 'cloud-account',
  generation: 1,
}
const FILE = {
  name: 'original.pdf',
  blob: new Blob(['ORIGINAL PDF BYTES'], { type: 'application/pdf' }),
}

function requestUrl(input: RequestInfo | URL): string {
  return input instanceof Request ? input.url : input.toString()
}

beforeEach(() => {
  setOfflineUser('owner')
  vi.mocked(cloudToken).mockReset().mockResolvedValue(TOKEN)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe.each([
  { provider: 'dropbox', save: saveToDropbox },
  { provider: 'onedrive', save: saveToOneDrive },
] as const)('$provider durable save', ({ provider, save }) => {
  it('uses the chosen folder and confirmed identity without prompting, preserving original bytes', async () => {
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      const address = requestUrl(url)
      if (address.includes('createUploadSession')) {
        expect(address).toContain('/items/folder:/original.pdf:/')
        expect(init?.body).toContain('"@microsoft.graph.conflictBehavior":"rename"')
        return Response.json({ uploadUrl: 'https://upload.up.1drv.com/session' })
      }
      if (!(init?.body instanceof Blob)) throw new Error('Expected original bytes')
      expect(await init.body.text()).toBe('ORIGINAL PDF BYTES')
      if (provider === 'dropbox') {
        expect(new Headers(init.headers).get('Dropbox-API-Arg')).toContain(
          '"path":"/originals/original.pdf"',
        )
        expect(new Headers(init.headers).get('Authorization')).toBe('Bearer provider-token')
      } else expect(new Headers(init.headers).has('Authorization')).toBe(false)
      return Response.json(
        {
          id: 'confirmed-file',
          name: 'original (1).pdf',
          webUrl: 'https://onedrive.live.com/?id=confirmed-file',
        },
        { status: 201 },
      )
    })
    vi.stubGlobal('fetch', fetcher)
    const collect = vi.fn(() => {
      expect(cloudToken).toHaveBeenCalledWith(provider, undefined)
      return Promise.resolve([FILE])
    })
    const popup = vi.spyOn(window, 'open')
    expect(await save(ALL_CLOUD_CONFIG, collect, TARGET)).toMatchObject([
      {
        id: 'confirmed-file',
        name: 'original (1).pdf',
        userId: 'owner',
        providerAccountId: 'cloud-account',
      },
    ])
    expect(popup).not.toHaveBeenCalled()
    expect(fetcher).toHaveBeenCalledTimes(provider === 'dropbox' ? 1 : 2)
  })

  it('rejects a foreign grant and a switched app account before exporting or uploading', async () => {
    const collect = vi.fn(() => Promise.resolve([FILE]))
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    await expect(
      save(ALL_CLOUD_CONFIG, collect, { ...TARGET, providerAccountId: 'foreign' }),
    ).rejects.toThrow('connection changed')
    expect(collect).not.toHaveBeenCalled()
    await expect(
      save(
        ALL_CLOUD_CONFIG,
        () => {
          setOfflineUser('other')
          return [FILE]
        },
        TARGET,
      ),
    ).rejects.toThrow('account changed')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('retains only confirmed files when a later provider upload fails', async () => {
    const fetcher = vi.fn<typeof fetch>()
    if (provider === 'onedrive')
      fetcher.mockResolvedValueOnce(
        Response.json({ uploadUrl: 'https://upload.up.1drv.com/session' }),
      )
    fetcher
      .mockResolvedValueOnce(
        Response.json(
          { id: 'saved', name: FILE.name, webUrl: 'https://onedrive.live.com/?id=saved' },
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
    vi.stubGlobal('fetch', fetcher)
    await expect(save(ALL_CLOUD_CONFIG, [FILE, FILE, FILE], TARGET)).rejects.toMatchObject({
      name: 'CloudBatchError',
      saved: [{ id: 'saved' }],
    })
    expect(fetcher).toHaveBeenCalledTimes(provider === 'dropbox' ? 2 : 3)
  })
})

it('uses Dropbox sessions for large videos with contiguous offsets and final non-overwriting commit', async () => {
  const chunk = new Blob([new Uint8Array(8_388_608)])
  const video = new Blob(
    Array.from({ length: 17 }, () => chunk),
    { type: 'video/mp4' },
  )
  const fetcher = vi.fn<typeof fetch>((url) => {
    const address = requestUrl(url)
    if (address.endsWith('/start')) return Promise.resolve(Response.json({ session_id: 'session' }))
    if (address.endsWith('/finish'))
      return Promise.resolve(Response.json({ id: 'large', name: 'movie.mp4' }))
    return Promise.resolve(Response.json(null))
  })
  vi.stubGlobal('fetch', fetcher)
  expect(
    await saveToDropbox(ALL_CLOUD_CONFIG, [{ name: 'movie.mp4', blob: video }], TARGET),
  ).toMatchObject([{ id: 'large' }])
  expect(fetcher).toHaveBeenCalledTimes(17)
  for (const [index, [url, init]] of fetcher.mock.calls.entries()) {
    expect(init?.body).toBeInstanceOf(Blob)
    expect((init?.body as Blob).size).toBe(8_388_608)
    const argument: unknown = JSON.parse(new Headers(init?.headers).get('Dropbox-API-Arg') ?? '{}')
    if (index > 0)
      expect(argument).toMatchObject({
        cursor: { session_id: 'session', offset: index * 8_388_608 },
      })
    if (index === 16) {
      expect(requestUrl(url)).toContain('/finish')
      expect(argument).toMatchObject({
        commit: { path: '/originals/movie.mp4', mode: 'add', autorename: true },
      })
    }
  }
})

it('refuses missing Dropbox configuration, paths, and empty media without uploading bytes', async () => {
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  await expect(
    saveToDropbox({ ...ALL_CLOUD_CONFIG, dropboxAppKey: null }, [FILE], TARGET),
  ).rejects.toThrow('not configured')
  expect(cloudToken).not.toHaveBeenCalled()
  await expect(
    saveToDropbox(ALL_CLOUD_CONFIG, [FILE], {
      ...TARGET,
      folder: { id: 'folder', name: 'Unknown Path' },
    }),
  ).rejects.toThrow('folder path')
  await expect(
    saveToDropbox(ALL_CLOUD_CONFIG, [{ name: 'empty.pdf', blob: new Blob() }], TARGET),
  ).rejects.toMatchObject({
    name: 'CloudBatchError',
    saved: [],
    cause: { message: expect.stringContaining('empty file') },
  })
  expect(fetcher).not.toHaveBeenCalled()
})

it('retains the granted Dropbox root for callers without an explicit destination', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ id: 'root-file', name: FILE.name }))
  vi.stubGlobal('fetch', fetcher)
  expect(await saveToDropbox(ALL_CLOUD_CONFIG, [FILE])).toMatchObject([{ id: 'root-file' }])
  const header = new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('Dropbox-API-Arg') ?? '{}'
  expect(JSON.parse(header)).toMatchObject({ path: '/original.pdf', mode: 'add', autorename: true })
})
