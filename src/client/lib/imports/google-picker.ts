/** Google Drive Picker supplies per-file/folder authorization; durable OAuth tokens come from the Worker. */
import { cloudTargetToken, type CloudSaveTarget } from './cloud-folders'
import {
  DEFAULT_CLOUD_MEDIA_KINDS,
  cloudMediaTypes,
  toCloudFile,
  type CloudMediaKind,
} from './cloud-media'
import { cloudRequest, trustedCloudUrl } from './cloud-transfer'
import type { PublicConfig } from '../../../shared/api'
import { GOOGLE_API_SCRIPT_URL, GOOGLE_DRIVE_FILES_ENDPOINT } from '../../../shared/constants'
import { CLOUD_CONNECTION_CHANGED_EVENT, captureCloudOwner } from '../cloud-connection-context'
import { ACCOUNT_CHANGED_EVENT } from '../offline-account'

/** The `gapi` module name that supplies the Picker UI. */
const PICKER_MODULE = 'picker'
/** Drive's media alias: return the file bytes rather than its metadata. */
const DRIVE_ALT_MEDIA_QUERY = 'alt=media'
/** Authorization header carrying the OAuth bearer token on the media download. */
const AUTHORIZATION_HEADER = 'Authorization'
const BEARER_PREFIX = 'Bearer '

/** One document as the Picker reports it in its callback payload. */
interface PickerDocument {
  readonly id: string
  readonly name: string
  readonly mimeType: string
}

/** The Picker callback payload: an action plus, once picked, the chosen docs. */
export interface PickerResponse {
  readonly action: string
  readonly docs?: readonly PickerDocument[]
}

/** A chosen Drive file, normalized to what the download step needs. */
export interface PickedFile {
  readonly id: string
  readonly name: string
  readonly type: string
}

interface GooglePickerInstance {
  readonly setVisible: (isVisible: boolean) => void
}

interface GooglePickerBuilder {
  readonly addView: (view: object) => GooglePickerBuilder
  readonly enableFeature: (feature: string) => GooglePickerBuilder
  readonly setDeveloperKey: (key: string) => GooglePickerBuilder
  readonly setAppId: (appId: string) => GooglePickerBuilder
  readonly setOAuthToken: (token: string) => GooglePickerBuilder
  readonly setCallback: (callback: (data: PickerResponse) => void) => GooglePickerBuilder
  readonly build: () => GooglePickerInstance
}

interface GoogleDocsView {
  setIncludeFolders: (isIncluded: boolean) => GoogleDocsView
  setSelectFolderEnabled: (isEnabled: boolean) => GoogleDocsView
  setMimeTypes: (types: string) => GoogleDocsView
}

interface GooglePickerApi {
  readonly PickerBuilder: new () => GooglePickerBuilder
  readonly DocsView: new (viewId: string) => GoogleDocsView
  readonly ViewId: { readonly DOCS_IMAGES: string; readonly DOCS: string; readonly FOLDERS: string }
  readonly Feature: { readonly MULTISELECT_ENABLED: string; readonly SUPPORT_DRIVES: string }
  readonly Action: { readonly PICKED: string; readonly CANCEL: string }
}

interface GoogleApi {
  readonly picker: GooglePickerApi
}

/** `gapi.load` in its config form so we can observe both success and failure. */
interface GapiClient {
  readonly load: (apiName: string, config: { callback: () => void; onerror: () => void }) => void
}

declare global {
  interface Window {
    gapi?: GapiClient
    google?: GoogleApi
  }
}

/** The Drive media download URL for a file id. Pure: no network, unit-tested. */
export function driveMediaUrl(fileId: string): string {
  return `${GOOGLE_DRIVE_FILES_ENDPOINT}/${encodeURIComponent(fileId)}?${DRIVE_ALT_MEDIA_QUERY}`
}

/**
 * Normalise a Picker callback payload into the chosen files. A cancel (or any
 * payload without documents) maps to an empty list. Pure, so it is unit-tested
 * without loading the Picker. Order is preserved.
 */
export function mapPickedDocuments(response: PickerResponse): PickedFile[] {
  const documents = response.docs ?? []
  return documents.map((doc) => ({ id: doc.id, name: doc.name, type: doc.mimeType }))
}

/**
 * Download each chosen file's bytes from the Drive media endpoint with the
 * bearer token and turn them into `File`s, preserving the selection order. A
 * failed download rejects with a readable Error.
 */
export async function downloadDriveFiles(
  picked: readonly PickedFile[],
  accessToken: string,
  mediaKinds: readonly CloudMediaKind[] = DEFAULT_CLOUD_MEDIA_KINDS,
  signal?: AbortSignal,
): Promise<File[]> {
  return await Promise.all(
    picked.map(async (item) => {
      return await cloudRequest(
        driveMediaUrl(item.id),
        {
          signal: signal ?? null,
          redirect: 'follow',
          headers: { [AUTHORIZATION_HEADER]: `${BEARER_PREFIX}${accessToken}` },
        },
        async (response) => {
          if (!response.ok) {
            throw new Error(
              `Could not download ${item.name} from Google Drive (HTTP ${String(response.status)}).`,
            )
          }
          if (response.url !== '')
            trustedCloudUrl(response.url, ['www.googleapis.com', 'googleusercontent.com'])
          const blob = await response.blob()
          return toCloudFile(blob, item.name, item.type, mediaKinds)
        },
      )
    }),
  )
}

/**
 * On-demand loads, memoised so re-opening the picker never re-injects a script
 * or reloads the Picker module. Keyed by the script URL, plus `PICKER_MODULE`
 * for the `gapi`-loaded Picker UI. A `Map` is mutated rather than reassigning a
 * module-level binding, matching the caching style used elsewhere in the app.
 */
const loadPromises = new Map<string, Promise<void>>()

/** Inject a `<script>` once and resolve when it loads; rejects on a load error. */
function loadScriptOnce(source: string): Promise<void> {
  const existing = loadPromises.get(source)
  if (existing !== undefined) {
    return existing
  }
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = source
    script.async = true
    script.addEventListener('load', () => {
      resolve()
    })
    script.addEventListener('error', () => {
      loadPromises.delete(source)
      script.remove()
      reject(new Error(`Could not load the Google SDK from ${source}.`))
    })
    document.head.append(script)
  })
  loadPromises.set(source, promise)
  return promise
}

/** Load `api.js`, then have `gapi` bring in the Picker module. Memoised. */
async function loadPickerModule(): Promise<void> {
  await loadScriptOnce(GOOGLE_API_SCRIPT_URL)
  const gapi = window.gapi
  if (gapi === undefined) {
    throw new Error('The Google API loader did not initialize.')
  }
  const promise =
    loadPromises.get(PICKER_MODULE) ??
    new Promise<void>((resolve, reject) => {
      gapi.load(PICKER_MODULE, {
        callback: () => {
          resolve()
        },
        onerror: () => {
          loadPromises.delete(PICKER_MODULE)
          reject(new Error('Could not load the Google Picker module.'))
        },
      })
    })
  loadPromises.set(PICKER_MODULE, promise)
  await promise
}

interface PickerOptions {
  mode: 'files' | 'folder'
  mediaKinds: readonly CloudMediaKind[]
  signal?: AbortSignal | undefined
}

/** Google Picker grants selected files/folders while the durable server connection supplies its token. */
function showPicker(
  picker: GooglePickerApi,
  token: string,
  apiKey: string,
  appId: string,
  options: PickerOptions,
): Promise<PickedFile[]> {
  const owner = captureCloudOwner()
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.removeEventListener(ACCOUNT_CHANGED_EVENT, changed)
      window.removeEventListener(CLOUD_CONNECTION_CHANGED_EVENT, changed)
      options.signal?.removeEventListener('abort', changed)
    }
    const changed = () => {
      instance.setVisible(false)
      cleanup()
      reject(new Error('Cloud file selection was interrupted.'))
    }
    const view = new picker.DocsView(
      options.mode === 'folder' ? picker.ViewId.FOLDERS : picker.ViewId.DOCS,
    )
      .setIncludeFolders(true)
      .setSelectFolderEnabled(options.mode === 'folder')
      .setMimeTypes(
        options.mode === 'folder'
          ? 'application/vnd.google-apps.folder'
          : cloudMediaTypes(options.mediaKinds).join(','),
      )
    const builder = new picker.PickerBuilder()
      .addView(view)
      .enableFeature(picker.Feature.SUPPORT_DRIVES)
      .setDeveloperKey(apiKey)
      .setAppId(appId)
      .setOAuthToken(token)
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED) {
          cleanup()
          try {
            owner.assertCurrent()
            const picked = mapPickedDocuments(data)
            if (picked.length === 0) throw new Error('Google Drive returned no selected file.')
            resolve(picked)
          } catch (error) {
            reject(error instanceof Error ? error : new Error('Google file selection failed.'))
          }
        } else if (data.action === picker.Action.CANCEL) {
          cleanup()
          resolve([])
        }
      })
    if (options.mode === 'files') builder.enableFeature(picker.Feature.MULTISELECT_ENABLED)
    const instance = builder.build()
    window.addEventListener(ACCOUNT_CHANGED_EVENT, changed, { once: true })
    window.addEventListener(CLOUD_CONNECTION_CHANGED_EVENT, changed, { once: true })
    options.signal?.addEventListener('abort', changed, { once: true })
    options.signal?.throwIfAborted()
    instance.setVisible(true)
  })
}

async function choose(
  config: PublicConfig,
  options: PickerOptions,
  expected?: Pick<CloudSaveTarget, 'providerAccountId' | 'generation'>,
) {
  const owner = captureCloudOwner()
  const apiKey = config.googlePickerApiKey
  const appId = config.googlePickerAppId
  if (apiKey === null || appId === null)
    throw new Error('Google Drive Picker is not configured on this server.')
  const token = await cloudTargetToken('google', expected, options.signal)
  await loadPickerModule()
  owner.assertCurrent()
  const google = window.google
  if (google === undefined) throw new Error('Google Drive Picker did not load.')
  const picked = await showPicker(google.picker, token.accessToken, apiKey, appId, options)
  owner.assertCurrent()
  return { token, picked }
}

/** Explicit native picker selection authorizes additional files without requesting OAuth consent again. */
export async function pickFromGoogleDrive(
  config: PublicConfig,
  mediaKinds: readonly CloudMediaKind[] = DEFAULT_CLOUD_MEDIA_KINDS,
  expected?: Pick<CloudSaveTarget, 'providerAccountId' | 'generation'>,
  signal?: AbortSignal,
): Promise<File[]> {
  const owner = captureCloudOwner()
  const { token, picked } = await choose(config, { mode: 'files', mediaKinds, signal }, expected)
  owner.assertCurrent()
  const files = await downloadDriveFiles(picked, token.accessToken, mediaKinds, signal)
  owner.assertCurrent()
  return files
}

/** A selected destination stays bound to the connected account and its grant generation. */
export async function pickGoogleDriveFolder(
  config: PublicConfig,
  expected?: Pick<CloudSaveTarget, 'providerAccountId' | 'generation'>,
  signal?: AbortSignal,
): Promise<CloudSaveTarget | null> {
  const owner = captureCloudOwner()
  const { token, picked } = await choose(
    config,
    { mode: 'folder', mediaKinds: [], signal },
    expected,
  )
  owner.assertCurrent()
  const folder = picked[0]
  if (folder === undefined) return null
  if (folder.type !== 'application/vnd.google-apps.folder')
    throw new Error('Choose a Google Drive folder for this destination.')
  return {
    folder: { id: folder.id, name: folder.name },
    providerAccountId: token.providerAccountId,
    generation: token.generation,
  }
}
