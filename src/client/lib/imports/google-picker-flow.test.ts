import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PickerResponse } from './google-picker'
import { ALL_CLOUD_CONFIG } from '../../test-support/cloud-config'

type TokenOptions = Parameters<
  NonNullable<Window['google']>['accounts']['oauth2']['initTokenClient']
>[0]
type TokenReply = Parameters<TokenOptions['callback']>[0]
type TokenError = Parameters<TokenOptions['error_callback']>[0]
type Builder = InstanceType<NonNullable<Window['google']>['picker']['PickerBuilder']>

const sdk: {
  tokenReply: TokenReply | null
  tokenError: TokenError | null
  tokenOptions: TokenOptions | null
  pickerReply: PickerResponse | null
  pickerCallback: ((response: PickerResponse) => void) | null
  scriptEvent: 'load' | 'error'
  moduleFails: boolean
  visible: boolean[]
  settings: {
    view?: object
    feature?: string
    key?: string
    appId?: string
    token?: string
  }
} = {
  tokenReply: null,
  tokenError: null,
  tokenOptions: null,
  pickerReply: null,
  pickerCallback: null,
  scriptEvent: 'load',
  moduleFails: false,
  visible: [],
  settings: {},
}

class PickerBoundary implements Builder {
  addView(view: object): this {
    sdk.settings.view = view
    return this
  }
  enableFeature(feature: string): this {
    sdk.settings.feature = feature
    return this
  }
  setDeveloperKey(key: string): this {
    sdk.settings.key = key
    return this
  }
  setAppId(appId: string): this {
    sdk.settings.appId = appId
    return this
  }
  setOAuthToken(token: string): this {
    sdk.settings.token = token
    return this
  }
  setCallback(callback: (response: PickerResponse) => void): this {
    sdk.pickerCallback = callback
    return this
  }
  build() {
    return {
      setVisible(isVisible: boolean) {
        sdk.visible.push(isVisible)
        if (isVisible && sdk.pickerReply !== null) {
          const response = sdk.pickerReply
          queueMicrotask(() => sdk.pickerCallback?.(response))
        }
      },
    }
  }
}

class ViewBoundary {
  readonly id: string
  constructor(id: string) {
    this.id = id
  }
}

async function subject() {
  const module = await import('./google-picker')
  const context = await import('../offline-context')
  context.setOfflineUser('owner')
  return { ...module, ...context }
}

beforeEach(() => {
  vi.resetModules()
  sdk.tokenReply = { access_token: 'provider-token' }
  sdk.tokenError = null
  sdk.tokenOptions = null
  sdk.pickerReply = {
    action: 'picked',
    docs: [{ id: 'photo/id', name: 'coast.png', mimeType: 'image/png' }],
  }
  sdk.pickerCallback = null
  sdk.scriptEvent = 'load'
  sdk.moduleFails = false
  sdk.visible = []
  sdk.settings = {}
  const gapi: NonNullable<Window['gapi']> = {
    load: vi.fn<NonNullable<Window['gapi']>['load']>((moduleName, options) => {
      expect(moduleName).toBe('picker')
      queueMicrotask(() => (sdk.moduleFails ? options.onerror() : options.callback()))
    }),
  }
  const google: NonNullable<Window['google']> = {
    accounts: {
      oauth2: {
        initTokenClient(options) {
          sdk.tokenOptions = options
          return {
            requestAccessToken(request) {
              expect(request).toEqual({ prompt: 'select_account' })
              queueMicrotask(() => {
                if (sdk.tokenError !== null) options.error_callback(sdk.tokenError)
                else if (sdk.tokenReply !== null) options.callback(sdk.tokenReply)
              })
            },
          }
        },
      },
    },
    picker: {
      PickerBuilder: PickerBoundary,
      DocsView: ViewBoundary,
      ViewId: { DOCS_IMAGES: 'images' },
      Feature: { MULTISELECT_ENABLED: 'multiselect' },
      Action: { PICKED: 'picked', CANCEL: 'cancel' },
    },
  }
  Object.assign(window, { gapi, google })
  const append = document.head.append.bind(document.head)
  vi.spyOn(document.head, 'append').mockImplementation((...nodes) => {
    append(...nodes)
    for (const node of nodes)
      if (node instanceof HTMLScriptElement)
        queueMicrotask(() => node.dispatchEvent(new Event(sdk.scriptEvent)))
  })
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response('ACTUAL IMAGE BYTES', { headers: { 'content-type': 'image/png' } }),
      ),
    ),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete window.google
  delete window.gapi
  for (const script of document.head.querySelectorAll('script')) script.remove()
})

describe('actual Google Drive picker entry point', () => {
  it('loads SDKs once, requests narrow scope, opens the image picker, and returns downloaded bytes', async () => {
    const { pickFromGoogleDrive } = await subject()
    const [file] = await pickFromGoogleDrive(ALL_CLOUD_CONFIG)
    expect(file).toBeInstanceOf(File)
    expect(file?.name).toBe('coast.png')
    expect(file?.type).toBe('image/png')
    expect(await file?.text()).toBe('ACTUAL IMAGE BYTES')
    expect(sdk.tokenOptions).toMatchObject({
      client_id: ALL_CLOUD_CONFIG.googleOAuthClientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
    })
    expect(sdk.settings).toEqual({
      view: { id: 'images' },
      feature: 'multiselect',
      key: ALL_CLOUD_CONFIG.googlePickerApiKey,
      appId: ALL_CLOUD_CONFIG.googlePickerAppId,
      token: 'provider-token',
    })
    expect(fetch).toHaveBeenCalledWith(
      'https://www.googleapis.com/drive/v3/files/photo%2Fid?alt=media',
      expect.objectContaining({
        headers: { Authorization: 'Bearer provider-token' },
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      }),
    )
    await pickFromGoogleDrive(ALL_CLOUD_CONFIG)
    expect(document.head.querySelectorAll('script')).toHaveLength(2)
    const gapi = window.gapi
    expect(gapi?.load).toHaveBeenCalledOnce()
  })

  it('ignores intermediate picker actions and resolves cancellation without downloading', async () => {
    sdk.pickerReply = null
    const { pickFromGoogleDrive } = await subject()
    const pending = pickFromGoogleDrive(ALL_CLOUD_CONFIG)
    await vi.waitFor(() => expect(sdk.pickerCallback).not.toBeNull())
    sdk.pickerCallback?.({ action: 'loaded' })
    expect(fetch).not.toHaveBeenCalled()
    sdk.pickerCallback?.({ action: 'cancel' })
    await expect(pending).resolves.toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    [
      { access_token: '', error: 'access_denied', error_description: 'Consent denied' },
      'Consent denied',
    ],
    [{ access_token: '', error: 'access_denied' }, 'access_denied'],
    [{ access_token: '' }, 'usable token'],
  ])(
    'rejects a failed or empty token response %j before opening the picker',
    async (reply, message) => {
      sdk.tokenReply = reply
      const { pickFromGoogleDrive } = await subject()
      await expect(pickFromGoogleDrive(ALL_CLOUD_CONFIG)).rejects.toThrow(message)
      expect(sdk.visible).toEqual([])
      expect(fetch).not.toHaveBeenCalled()
    },
  )

  it.each([
    [{ type: 'popup_closed' }, 'popup_closed'],
    [{ type: 'popup_failed_to_open', message: 'Popup blocked' }, 'Popup blocked'],
  ])('reports browser token errors %j without issuing a download', async (error, message) => {
    sdk.tokenError = error
    const { pickFromGoogleDrive } = await subject()
    await expect(pickFromGoogleDrive(ALL_CLOUD_CONFIG)).rejects.toThrow(message)
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each(['googleOAuthClientId', 'googlePickerApiKey', 'googlePickerAppId'] as const)(
    'rejects missing deployment configuration %s before injecting scripts',
    async (field) => {
      const { pickFromGoogleDrive } = await subject()
      await expect(pickFromGoogleDrive({ ...ALL_CLOUD_CONFIG, [field]: null })).rejects.toThrow(
        'not configured',
      )
      expect(document.head.querySelectorAll('script')).toHaveLength(0)
    },
  )

  it('reports missing API and Identity globals instead of pretending SDK load succeeded', async () => {
    const { pickFromGoogleDrive, acquireGoogleDriveToken } = await subject()
    delete window.gapi
    await expect(pickFromGoogleDrive(ALL_CLOUD_CONFIG)).rejects.toThrow(
      'API loader did not initialise',
    )
    delete window.google
    await expect(acquireGoogleDriveToken('client-id')).rejects.toThrow(
      'Identity SDK did not initialise',
    )
  })

  it('reports missing combined SDK global after successful module loading', async () => {
    const { pickFromGoogleDrive } = await subject()
    delete window.google
    await expect(pickFromGoogleDrive(ALL_CLOUD_CONFIG)).rejects.toThrow('SDKs did not initialise')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('retries a failed script load with a fresh script and no cached rejected promise', async () => {
    sdk.scriptEvent = 'error'
    const { pickFromGoogleDrive } = await subject()
    await expect(pickFromGoogleDrive(ALL_CLOUD_CONFIG)).rejects.toThrow(
      'Could not load the Google SDK',
    )
    sdk.scriptEvent = 'load'
    const files = await pickFromGoogleDrive(ALL_CLOUD_CONFIG)
    expect(files[0]?.name).toBe('coast.png')
    expect(document.head.querySelectorAll('script')).toHaveLength(2)
  })

  it('retries a failed Picker module without reinjecting the SDK scripts', async () => {
    sdk.moduleFails = true
    const { pickFromGoogleDrive } = await subject()
    await expect(pickFromGoogleDrive(ALL_CLOUD_CONFIG)).rejects.toThrow(
      'Could not load the Google Picker module',
    )
    sdk.moduleFails = false
    expect(await pickFromGoogleDrive(ALL_CLOUD_CONFIG)).toHaveLength(1)
    const gapi = window.gapi
    expect(gapi?.load).toHaveBeenCalledTimes(2)
    expect(document.head.querySelectorAll('script')).toHaveLength(2)
  })

  it('closes the picker on an account transition and never downloads its stale selection', async () => {
    sdk.pickerReply = null
    const { pickFromGoogleDrive, setOfflineUser } = await subject()
    const pending = expect(pickFromGoogleDrive(ALL_CLOUD_CONFIG)).rejects.toThrow('account changed')
    await vi.waitFor(() => expect(sdk.pickerCallback).not.toBeNull())
    setOfflineUser('other')
    const { ACCOUNT_CHANGED_EVENT } = await import('../offline-account')
    window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT))
    sdk.pickerCallback?.({
      action: 'picked',
      docs: [{ id: 'stale', name: 'stale.png', mimeType: 'image/png' }],
    })
    await pending
    expect(sdk.visible).toEqual([true, false])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects a stale sign-in callback even when no account-change event arrives', async () => {
    sdk.tokenReply = null
    const { pickFromGoogleDrive, setOfflineUser } = await subject()
    const pending = expect(pickFromGoogleDrive(ALL_CLOUD_CONFIG)).rejects.toThrow('account changed')
    await vi.waitFor(() => expect(sdk.tokenOptions).not.toBeNull())
    setOfflineUser('other')
    sdk.tokenOptions?.callback({ access_token: 'old-account-token' })
    await pending
    expect(sdk.visible).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })
})
