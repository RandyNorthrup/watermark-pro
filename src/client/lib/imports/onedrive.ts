/**
 * OneDrive import (M16). Auth is delegated to MSAL (`@azure/msal-browser`) and
 * browsing to Microsoft Graph — deliberately not the hosted OneDrive File
 * Picker iframe, which needs a different token audience and extra CSP frames.
 * A single `PublicClientApplication` is created lazily and its `initialize()`
 * promise cached, because MSAL forbids calling its APIs before initialization.
 *
 * The Graph children endpoint returns a mixed list; `mapGraphChildren` keeps
 * folders (for navigation) and image files (`file.mimeType` starting `image/`),
 * discarding everything else. Each image carries the short-lived,
 * pre-authenticated `@microsoft.graph.downloadUrl`, which is fetched without an
 * auth header. The URL builders and the mapper are pure and unit-tested; the
 * MSAL and network glue is exercised by the browser, not here.
 *
 * Saving uses a separately verified folder and rename-on-conflict upload
 * sessions in `onedrive-upload`. Tokens and temporary URLs remain in memory;
 * app-account transitions invalidate pending work and the cached MSAL instance.
 */
import type { PublicClientApplication } from '@azure/msal-browser'
import { z } from 'zod'

import {
  cloudFileIdSchema,
  cloudRequest,
  trustedCloudUrl,
  uploadCloudBatch,
  type CloudSavedFile,
} from './cloud-transfer'
import { toImageFile } from './download'
import { ensureOneDriveFolder, uploadOneDriveImage } from './onedrive-upload'
import type { CloudUploadSource } from './source'
import type { PublicConfig } from '../../../shared/api'
import {
  MICROSOFT_AUTHORITY,
  MICROSOFT_GRAPH_ROOT,
  MICROSOFT_GRAPH_SCOPE,
  MICROSOFT_OAUTH_REDIRECT_PATH,
} from '../../../shared/constants'
import { ACCOUNT_CHANGED_EVENT } from '../offline-account'
import { captureOfflineOwner } from '../offline-context'

/** Graph marks image files with a MIME type under this family. */
const IMAGE_MIME_PREFIX = 'image/'
/** The pre-authenticated, short-lived download link Graph attaches to a file item. */
const DOWNLOAD_URL_KEY = '@microsoft.graph.downloadUrl'
const AUTHORIZATION_HEADER = 'Authorization'
const BEARER_PREFIX = 'Bearer '
const FILE_HOSTS = [
  'files.1drv.com',
  'up.1drv.com',
  'my.microsoftpersonalcontent.com',
  'sharepoint.com',
]
const GRAPH_PAGE_LIMIT = 100

/** A folder in the drive; kept only so the picker can navigate into it. */
export interface OneDriveFolder {
  readonly kind: 'folder'
  readonly id: string
  readonly name: string
}

/** An image file the member can add; `downloadUrl` needs no auth header to fetch. */
export interface OneDriveImage {
  readonly kind: 'image'
  readonly id: string
  readonly name: string
  readonly mimeType: string
  readonly downloadUrl: string
}

/** One row of a Graph children listing, narrowed to what the picker uses. */
export type OneDriveItem = OneDriveFolder | OneDriveImage

/** Only the Graph `driveItem` fields the picker reads; extra keys are stripped. */
const graphDriveItemSchema = z.object({
  id: cloudFileIdSchema,
  name: z.string().min(1),
  /** Present (as a facet object) when the item is a folder. */
  folder: z.unknown().optional(),
  /** Present when the item is a file; carries its MIME type. */
  file: z.object({ mimeType: z.string() }).optional(),
  [DOWNLOAD_URL_KEY]: z.string().optional(),
})

const graphChildrenSchema = z.object({
  value: z.array(graphDriveItemSchema),
  '@odata.nextLink': z.string().optional(),
})

/**
 * Graph children endpoint for the drive root (`folderId` omitted) or a specific
 * folder. Pure, so the caller's URL construction is unit-tested without a
 * network.
 */
export function oneDriveChildrenUrl(folderId?: string): string {
  return folderId === undefined
    ? `${MICROSOFT_GRAPH_ROOT}/me/drive/root/children`
    : `${MICROSOFT_GRAPH_ROOT}/me/drive/items/${encodeURIComponent(folderId)}/children`
}

/**
 * Maps a Graph children response to the picker's item list: folders are kept
 * for navigation, files are kept only when their MIME type is an image and a
 * download URL is present (an image without one cannot be fetched, so it is
 * dropped rather than offered). Everything else is discarded. Pure and parsed
 * with Zod, so an untrusted payload cannot smuggle unexpected shapes through.
 */
export function mapGraphChildren(payload: unknown): OneDriveItem[] {
  const { value } = graphChildrenSchema.parse(payload)
  const items: OneDriveItem[] = []
  for (const entry of value) {
    const mimeType = entry.file?.mimeType
    if (mimeType?.startsWith(IMAGE_MIME_PREFIX) === true) {
      const downloadUrl = entry[DOWNLOAD_URL_KEY]
      if (downloadUrl !== undefined) {
        items.push({
          kind: 'image',
          id: entry.id,
          name: entry.name,
          mimeType,
          downloadUrl: trustedCloudUrl(downloadUrl, FILE_HOSTS),
        })
      }
      continue
    }
    if (entry.folder !== undefined) {
      items.push({ kind: 'folder', id: entry.id, name: entry.name })
    }
  }
  return items
}

/**
 * Holds the one-per-page MSAL instance promise. A mutable property on a const
 * object (rather than a reassigned module variable) keeps the memoisation
 * lint-clean while still caching across calls.
 */
const instanceCache: {
  promise: Promise<PublicClientApplication> | null
  owner: string | null
  clientId: string | null
  listening: boolean
} = { promise: null, owner: null, clientId: null, listening: false }

async function initInstance(clientId: string): Promise<PublicClientApplication> {
  const msal = await import('@azure/msal-browser')
  const instance = new msal.PublicClientApplication({
    auth: {
      clientId,
      authority: MICROSOFT_AUTHORITY,
      redirectUri: `${window.location.origin}${MICROSOFT_OAUTH_REDIRECT_PATH}`,
    },
    cache: { cacheLocation: 'memoryStorage' },
  })
  await instance.initialize()
  return instance
}

/** The shared MSAL instance, created and initialized once per page. */
async function getInstance(clientId: string): Promise<PublicClientApplication> {
  const owner = captureOfflineOwner()
  if (!instanceCache.listening) {
    instanceCache.listening = true
    window.addEventListener(
      ACCOUNT_CHANGED_EVENT,
      () => {
        instanceCache.promise = null
        instanceCache.owner = null
        instanceCache.clientId = null
        instanceCache.listening = false
      },
      { once: true },
    )
  }
  if (instanceCache.owner !== owner.userId || instanceCache.clientId !== clientId) {
    instanceCache.promise = null
    instanceCache.owner = owner.userId
    instanceCache.clientId = clientId
  }
  instanceCache.promise ??= initInstance(clientId)
  const pending = instanceCache.promise
  try {
    return await pending
  } catch (error) {
    if (instanceCache.promise === pending) instanceCache.promise = null
    throw error
  }
}

/**
 * A Graph access token with the `Files.Read` scope: reused silently from a
 * cached account when possible, otherwise obtained through an interactive
 * popup. The popup path also runs when the silent attempt reports that
 * interaction is required (a lapsed session or ungranted consent).
 */
export async function acquireGraphToken(clientId: string): Promise<string> {
  const owner = captureOfflineOwner()
  const { InteractionRequiredAuthError } = await import('@azure/msal-browser')
  owner.assertCurrent()
  const instance = await getInstance(clientId)
  owner.assertCurrent()
  const scopes = [MICROSOFT_GRAPH_SCOPE]
  const account = instance.getAllAccounts()[0]
  if (account !== undefined) {
    try {
      const silent = await instance.acquireTokenSilent({ scopes, account })
      owner.assertCurrent()
      return z.string().min(1).parse(silent.accessToken)
    } catch (error) {
      if (!(error instanceof InteractionRequiredAuthError)) {
        throw error
      }
    }
  }
  owner.assertCurrent()
  const popup = await instance.acquireTokenPopup({ scopes, prompt: 'select_account' })
  owner.assertCurrent()
  return z.string().min(1).parse(popup.accessToken)
}

/**
 * Lists the images and folders directly under the drive root, or under
 * `folderId`. A non-OK Graph response throws with the status so `describeError`
 * can surface it.
 */
export async function listOneDriveImages(
  token: string,
  folderId?: string,
): Promise<OneDriveItem[]> {
  const owner = captureOfflineOwner()
  const first = oneDriveChildrenUrl(folderId)
  let next: string | undefined = first
  const seen = new Set<string>()
  const items: OneDriveItem[] = []
  while (next !== undefined) {
    owner.assertCurrent()
    if (seen.has(next) || seen.size >= GRAPH_PAGE_LIMIT)
      throw new Error('OneDrive returned an invalid or oversized folder listing.')
    const url = new URL(trustedCloudUrl(next, ['graph.microsoft.com']))
    if (url.origin !== new URL(first).origin || url.pathname !== new URL(first).pathname)
      throw new Error('OneDrive returned an unexpected page link.')
    seen.add(next)
    const page: z.infer<typeof graphChildrenSchema> = await cloudRequest(
      next,
      { headers: { [AUTHORIZATION_HEADER]: `${BEARER_PREFIX}${token}` } },
      async (response) => {
        if (!response.ok)
          throw new Error(`Could not list OneDrive contents (HTTP ${String(response.status)}).`)
        return graphChildrenSchema.parse(await response.json())
      },
    )
    owner.assertCurrent()
    items.push(...mapGraphChildren(page))
    next = page['@odata.nextLink']
  }
  return items
}

/**
 * Fetches a chosen image through its pre-authenticated download URL (no auth
 * header) and returns it as a `File` the rest of the app ingests like a local
 * pick.
 */
export async function downloadOneDriveImage(item: OneDriveImage): Promise<File> {
  const url = trustedCloudUrl(item.downloadUrl, FILE_HOSTS)
  return await cloudRequest(
    url,
    { credentials: 'omit', referrerPolicy: 'no-referrer' },
    async (response) => {
      if (!response.ok) {
        throw new Error(`Could not download "${item.name}" (HTTP ${String(response.status)}).`)
      }
      const blob = await response.blob()
      if (response.url !== '') trustedCloudUrl(response.url, FILE_HOSTS)
      return toImageFile(blob, item.name, item.mimeType)
    },
  )
}

/**
 * Signs in with MSAL (`Files.ReadWrite`) and writes every watermarked photo to
 * the user's OneDrive save folder, in order. Throws a descriptive error when
 * OneDrive is not configured; a failed sign-in or upload rejects with a readable
 * message naming the file.
 */
export async function saveToOneDrive(
  config: PublicConfig,
  uploads: CloudUploadSource,
): Promise<CloudSavedFile[]> {
  const clientId = config.microsoftClientId
  if (clientId === null) {
    throw new Error('OneDrive is not configured for this deployment.')
  }
  const owner = captureOfflineOwner()
  const token = await acquireGraphToken(clientId)
  owner.assertCurrent()
  const files = typeof uploads === 'function' ? await uploads() : uploads
  owner.assertCurrent()
  if (files.length === 0) return []
  const folder = await ensureOneDriveFolder(token)
  owner.assertCurrent()
  return await uploadCloudBatch(files, (upload) => uploadOneDriveImage(token, upload, folder))
}
