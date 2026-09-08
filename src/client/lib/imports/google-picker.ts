/**
 * Google Drive picker (M16). Opens Drive's own file picker, lets the member
 * choose one or more images, and returns them as `File`s the app ingests like a
 * local pick. Two Google SDKs are pulled in on demand by injecting their
 * `<script>` tags — no npm dependency — and each injection is memoised in a
 * module-level cache so re-opening the picker never re-loads them:
 *
 *   • the API loader (`apis.google.com/js/api.js`), whose `gapi.load('picker')`
 *     brings in the Picker UI, and
 *   • Google Identity Services (`accounts.google.com/gsi/client`), which mints a
 *     short-lived OAuth access token for the narrow `drive.file` scope.
 *
 * The token flow opens a popup on `accounts.google.com`; the served page must
 * therefore relax `Cross-Origin-Opener-Policy` to `same-origin-allow-popups`
 * (the default `same-origin` severs the opener and the popup can never report
 * back). Chosen files are streamed from the Drive media endpoint with the
 * bearer token and converted through `toImageFile`. The pure pieces — the media
 * URL, the picker-response mapping, and the per-file download — are extracted so
 * they unit-test without the SDKs; only the script/token/PickerBuilder
 * orchestration needs a browser.
 */
import { toImageFile } from './download'
import type { PublicConfig } from '../../../shared/api'
import {
  GOOGLE_API_SCRIPT_URL,
  GOOGLE_DRIVE_FILES_ENDPOINT,
  GOOGLE_DRIVE_SCOPE,
  GOOGLE_IDENTITY_SCRIPT_URL,
} from '../../../shared/constants'

/** The `gapi` module name that supplies the Picker UI. */
const PICKER_MODULE = 'picker'
/** Drive's media alias: return the file bytes rather than its metadata. */
const DRIVE_ALT_MEDIA_QUERY = 'alt=media'
/** Authorization header carrying the OAuth bearer token on the media download. */
const AUTHORIZATION_HEADER = 'Authorization'
const BEARER_PREFIX = 'Bearer '

/** The token-flow slice of Google Identity Services we drive. */
interface GoogleTokenResponse {
  readonly access_token: string
  readonly error?: string
  readonly error_description?: string
}

interface GoogleTokenErrorResponse {
  readonly type: string
  readonly message?: string
}

interface GoogleTokenClientConfig {
  readonly client_id: string
  readonly scope: string
  readonly callback: (response: GoogleTokenResponse) => void
  readonly error_callback: (error: GoogleTokenErrorResponse) => void
}

interface GoogleTokenClient {
  readonly requestAccessToken: () => void
}

interface GoogleAccounts {
  readonly oauth2: {
    readonly initTokenClient: (config: GoogleTokenClientConfig) => GoogleTokenClient
  }
}

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

/** A chosen Drive file, normalised to what the download step needs. */
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

interface GooglePickerApi {
  readonly PickerBuilder: new () => GooglePickerBuilder
  readonly DocsView: new (viewId: string) => object
  readonly ViewId: { readonly DOCS_IMAGES: string }
  readonly Feature: { readonly MULTISELECT_ENABLED: string }
  readonly Action: { readonly PICKED: string; readonly CANCEL: string }
}

interface GoogleApi {
  readonly accounts: GoogleAccounts
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
): Promise<File[]> {
  return await Promise.all(
    picked.map(async (item) => {
      const response = await fetch(driveMediaUrl(item.id), {
        headers: { [AUTHORIZATION_HEADER]: `${BEARER_PREFIX}${accessToken}` },
      })
      if (!response.ok) {
        throw new Error(
          `Could not download ${item.name} from Google Drive (HTTP ${String(response.status)}).`,
        )
      }
      const blob = await response.blob()
      return toImageFile(blob, item.name, item.type)
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
    throw new Error('The Google API loader did not initialise.')
  }
  const promise =
    loadPromises.get(PICKER_MODULE) ??
    new Promise<void>((resolve, reject) => {
      gapi.load(PICKER_MODULE, {
        callback: () => {
          resolve()
        },
        onerror: () => {
          reject(new Error('Could not load the Google Picker module.'))
        },
      })
    })
  loadPromises.set(PICKER_MODULE, promise)
  await promise
}

/** Load Google Identity Services. Memoised. */
function loadIdentityServices(): Promise<void> {
  return loadScriptOnce(GOOGLE_IDENTITY_SCRIPT_URL)
}

/**
 * Load Google Identity Services and mint a `drive.file` access token through its
 * popup flow. Exported so the save module (`google-drive-save`) shares the same
 * token dance rather than duplicating it.
 */
export async function acquireGoogleDriveToken(clientId: string): Promise<string> {
  await loadIdentityServices()
  const google = window.google
  if (google === undefined) {
    throw new Error('The Google Identity SDK did not initialise.')
  }
  return await requestAccessToken(google.accounts, clientId)
}

/** Request a `drive.file` access token via the GIS popup flow. */
function requestAccessToken(accounts: GoogleAccounts, clientId: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const client = accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_DRIVE_SCOPE,
      callback: (response) => {
        if (response.error !== undefined) {
          reject(
            new Error(`Google sign-in failed: ${response.error_description ?? response.error}.`),
          )
          return
        }
        resolve(response.access_token)
      },
      error_callback: (error) => {
        reject(new Error(`Google sign-in was cancelled or failed: ${error.message ?? error.type}.`))
      },
    })
    client.requestAccessToken()
  })
}

/**
 * Build and show the Picker, resolving the chosen files (empty on cancel). The
 * view is limited to Drive images and multi-select is enabled; the payload
 * mapping is delegated to the pure `mapPickedDocuments`.
 */
function showPicker(
  picker: GooglePickerApi,
  token: string,
  apiKey: string,
  appId: string,
): Promise<PickedFile[]> {
  return new Promise<PickedFile[]>((resolve) => {
    const instance = new picker.PickerBuilder()
      .addView(new picker.DocsView(picker.ViewId.DOCS_IMAGES))
      .enableFeature(picker.Feature.MULTISELECT_ENABLED)
      .setDeveloperKey(apiKey)
      .setAppId(appId)
      .setOAuthToken(token)
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED) {
          resolve(mapPickedDocuments(data))
        } else if (data.action === picker.Action.CANCEL) {
          resolve([])
        }
        // Intermediate actions (e.g. the picker finishing loading) are ignored.
      })
      .build()
    instance.setVisible(true)
  })
}

/**
 * Open the Google Drive picker and resolve the chosen images as `File`s
 * (empty when the member cancels). Throws when the deployment has not
 * configured Google's keys or when the browser globals are unavailable.
 */
export async function pickFromGoogleDrive(config: PublicConfig): Promise<File[]> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('The Google Drive picker is only available in a browser.')
  }
  const clientId = config.googleOAuthClientId
  const apiKey = config.googlePickerApiKey
  const appId = config.googlePickerAppId
  if (clientId === null || apiKey === null || appId === null) {
    throw new Error('Google Drive import is not configured for this deployment.')
  }

  await Promise.all([loadPickerModule(), loadIdentityServices()])
  const google = window.google
  if (google === undefined) {
    throw new Error('The Google SDKs did not initialise.')
  }

  const token = await requestAccessToken(google.accounts, clientId)
  const picked = await showPicker(google.picker, token, apiKey, appId)
  return await downloadDriveFiles(picked, token)
}
