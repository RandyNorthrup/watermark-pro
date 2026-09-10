import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ALL_CLOUD_CONFIG } from '../../test-support/cloud-config'

type ChooserOptions = Parameters<NonNullable<Window['Dropbox']>['choose']>[0]
const FILES = [
  { name: 'coast.png', link: 'https://dl.dropboxusercontent.com/s/coast.png' },
  { name: 'mountain.png', link: 'https://dl.dropboxusercontent.com/s/mountain.png' },
]
const sdk: {
  action: 'success' | 'cancel' | 'hold'
  files: typeof FILES
  options: ChooserOptions | null
  scriptEvent: 'load' | 'error'
  exposeOnLoad: boolean
} = {
  action: 'success',
  files: FILES,
  options: null,
  scriptEvent: 'load',
  exposeOnLoad: true,
}

function chooserBoundary(): NonNullable<Window['Dropbox']> {
  return {
    choose(options) {
      sdk.options = options
      queueMicrotask(() => {
        if (sdk.action === 'success') options.success(sdk.files)
        else if (sdk.action === 'cancel') options.cancel()
      })
    },
  }
}

async function subject() {
  const module = await import('./dropbox-chooser')
  const context = await import('../offline-context')
  context.setOfflineUser('owner')
  return { ...module, ...context }
}

beforeEach(() => {
  vi.resetModules()
  sdk.action = 'success'
  sdk.files = FILES
  sdk.options = null
  sdk.scriptEvent = 'load'
  sdk.exposeOnLoad = true
  Object.assign(window, { Dropbox: chooserBoundary() })
  const append = document.head.append.bind(document.head)
  vi.spyOn(document.head, 'append').mockImplementation((...nodes) => {
    append(...nodes)
    for (const node of nodes)
      if (node instanceof HTMLScriptElement)
        queueMicrotask(() => {
          if (sdk.exposeOnLoad) Object.assign(window, { Dropbox: chooserBoundary() })
          node.dispatchEvent(new Event(sdk.scriptEvent))
        })
  })
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>((url) => {
      const address = url instanceof Request ? url.url : url.toString()
      return Promise.resolve(
        new Response(address.endsWith('coast.png') ? 'COAST IMAGE' : 'MOUNTAIN IMAGE', {
          headers: { 'content-type': 'image/png' },
        }),
      )
    }),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete window.Dropbox
  document.querySelector('#dropboxjs')?.remove()
})

describe('actual Dropbox chooser entry point', () => {
  it('uses the loaded SDK and returns selected bytes in order without app cookies or referrer', async () => {
    const { pickFromDropbox } = await subject()
    const files = await pickFromDropbox(ALL_CLOUD_CONFIG)
    expect(files.map((file) => file.name)).toEqual(['coast.png', 'mountain.png'])
    expect(await Promise.all(files.map((file) => file.text()))).toEqual([
      'COAST IMAGE',
      'MOUNTAIN IMAGE',
    ])
    expect(files.map((file) => file.type)).toEqual(['image/png', 'image/png'])
    expect(sdk.options).toMatchObject({
      linkType: 'direct',
      multiselect: true,
      extensions: ['.png', '.jpg', '.jpeg', '.webp'],
    })
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      FILES[0]?.link,
      expect.objectContaining({
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
      }),
    )
    expect(document.querySelector('#dropboxjs')).not.toBeInTheDocument()
  })

  it('injects the configured Chooser script only once across repeated imports', async () => {
    delete window.Dropbox
    const { pickFromDropbox } = await subject()
    await pickFromDropbox(ALL_CLOUD_CONFIG)
    const script = document.querySelector('#dropboxjs')
    expect(script).toHaveAttribute('src', 'https://www.dropbox.com/static/api/2/dropins.js')
    expect(script).toHaveAttribute('data-app-key', ALL_CLOUD_CONFIG.dropboxAppKey)
    await pickFromDropbox(ALL_CLOUD_CONFIG)
    expect(document.head.querySelectorAll('script')).toHaveLength(1)
    expect(document.querySelector('#dropboxjs')).toBe(script)
  })

  it('resolves cancellation without downloading any file', async () => {
    sdk.action = 'cancel'
    const { pickFromDropbox } = await subject()
    await expect(pickFromDropbox(ALL_CLOUD_CONFIG)).resolves.toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refuses a lookalike direct-link host before any download', async () => {
    sdk.files = [
      { name: 'unsafe.png', link: 'https://dropboxusercontent.com.evil.test/unsafe.png' },
    ]
    const { pickFromDropbox } = await subject()
    await expect(pickFromDropbox(ALL_CLOUD_CONFIG)).rejects.toThrow('unexpected URL')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('stops the selection after a failed download instead of fetching later files', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 403 }))
    const { pickFromDropbox } = await subject()
    await expect(pickFromDropbox(ALL_CLOUD_CONFIG)).rejects.toThrow(
      'coast.png from Dropbox (HTTP 403)',
    )
    expect(fetch).toHaveBeenCalledOnce()
  })

  it.each([
    ['https://dl.dropboxusercontent.com/final/coast.png', true],
    ['https://evil.test/redirect/coast.png', false],
  ])('checks the final response URL %s before accepting bytes', async (url, trusted) => {
    const response = new Response('REDIRECTED IMAGE', { headers: { 'content-type': 'image/png' } })
    Object.defineProperty(response, 'url', { value: url })
    vi.mocked(fetch).mockResolvedValueOnce(response)
    const { pickFromDropbox } = await subject()
    if (trusted) {
      const files = await pickFromDropbox(ALL_CLOUD_CONFIG)
      expect(await files[0]?.text()).toBe('REDIRECTED IMAGE')
    } else {
      await expect(pickFromDropbox(ALL_CLOUD_CONFIG)).rejects.toThrow('unexpected URL')
      expect(fetch).toHaveBeenCalledOnce()
    }
  })

  it('refuses a late selection from a previous app account', async () => {
    sdk.action = 'hold'
    const { pickFromDropbox, setOfflineUser } = await subject()
    const pending = expect(pickFromDropbox(ALL_CLOUD_CONFIG)).rejects.toThrow('account changed')
    await vi.waitFor(() => expect(sdk.options).not.toBeNull())
    setOfflineUser('other')
    sdk.options?.success(FILES)
    await pending
    expect(fetch).not.toHaveBeenCalled()
  })

  it('discards an in-flight response after an app account switch and does not fetch the next file', async () => {
    const response = Promise.withResolvers<Response>()
    vi.mocked(fetch).mockReturnValueOnce(response.promise)
    const { pickFromDropbox, setOfflineUser } = await subject()
    const pending = expect(pickFromDropbox(ALL_CLOUD_CONFIG)).rejects.toThrow('account changed')
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    setOfflineUser('other')
    response.resolve(
      new Response('OLD ACCOUNT IMAGE', { headers: { 'content-type': 'image/png' } }),
    )
    await pending
    expect(fetch).toHaveBeenCalledOnce()
  })

  it.each([
    ['error', true, 'failed to load'],
    ['load', false, 'without exposing its API'],
  ] as const)('reports script failure %s with API exposure %s', async (event, expose, message) => {
    delete window.Dropbox
    sdk.scriptEvent = event
    sdk.exposeOnLoad = expose
    const { pickFromDropbox } = await subject()
    await expect(pickFromDropbox(ALL_CLOUD_CONFIG)).rejects.toThrow(message)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects missing deployment configuration before opening the chooser', async () => {
    const { pickFromDropbox } = await subject()
    await expect(pickFromDropbox({ ...ALL_CLOUD_CONFIG, dropboxAppKey: null })).rejects.toThrow(
      'not configured',
    )
    expect(sdk.options).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('deduplicates concurrent loads and permits a fresh user retry after a transient script failure', async () => {
    delete window.Dropbox
    sdk.scriptEvent = 'error'
    sdk.exposeOnLoad = false
    const { pickFromDropbox } = await subject()
    const first = pickFromDropbox(ALL_CLOUD_CONFIG)
    const second = pickFromDropbox(ALL_CLOUD_CONFIG)
    expect(document.head.querySelectorAll('script')).toHaveLength(1)
    await Promise.all([
      expect(first).rejects.toThrow('failed to load'),
      expect(second).rejects.toThrow('failed to load'),
    ])
    sdk.scriptEvent = 'load'
    sdk.exposeOnLoad = true
    const files = await pickFromDropbox(ALL_CLOUD_CONFIG)
    expect(await files[0]?.text()).toBe('COAST IMAGE')
    expect(document.head.querySelectorAll('script')).toHaveLength(1)
  })

  it('rejects execution outside the browser', async () => {
    const { pickFromDropbox } = await subject()
    vi.stubGlobal('window', undefined)
    await expect(pickFromDropbox(ALL_CLOUD_CONFIG)).rejects.toThrow('only load in a browser')
  })
})
