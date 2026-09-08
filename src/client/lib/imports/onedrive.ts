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
 * Saving back (M16 save-to-cloud) uses the same `Files.ReadWrite` token: each
 * watermarked photo is PUT to `.../root:/<CLOUD_SAVE_FOLDER>/<name>:/content`,
 * which creates the folder path if missing and supports the photo sizes this
 * app produces (Graph's simple upload accepts up to 250 MB).
 */
import { InteractionRequiredAuthError, PublicClientApplication } from '@azure/msal-browser'
import { z } from 'zod'

import { toImageFile } from './download'
import type { CloudUpload } from './source'
import type { PublicConfig } from '../../../shared/api'
import {
  CLOUD_SAVE_FOLDER,
  MICROSOFT_AUTHORITY,
  MICROSOFT_GRAPH_ROOT,
  MICROSOFT_GRAPH_SCOPE,
  MICROSOFT_OAUTH_REDIRECT_PATH,
} from '../../../shared/constants'

/** Graph marks image files with a MIME type under this family. */
const IMAGE_MIME_PREFIX = 'image/'
/** The pre-authenticated, short-lived download link Graph attaches to a file item. */
const DOWNLOAD_URL_KEY = '@microsoft.graph.downloadUrl'
const AUTHORIZATION_HEADER = 'Authorization'
const BEARER_PREFIX = 'Bearer '

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
  id: z.string(),
  name: z.string(),
  /** Present (as a facet object) when the item is a folder. */
  folder: z.unknown().optional(),
  /** Present when the item is a file; carries its MIME type. */
  file: z.object({ mimeType: z.string() }).optional(),
  [DOWNLOAD_URL_KEY]: z.string().optional(),
})

const graphChildrenSchema = z.object({
  value: z.array(graphDriveItemSchema),
})

/**
 * Graph children endpoint for the drive root (`folderId` omitted) or a specific
 * folder. Pure, so the caller's URL construction is unit-tested without a
 * network.
 */
export function oneDriveChildrenUrl(folderId?: string): string {
  return folderId === undefined
    ? `${MICROSOFT_GRAPH_ROOT}/me/drive/root/children`
    : `${MICROSOFT_GRAPH_ROOT}/me/drive/items/${folderId}/children`
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
        items.push({ kind: 'image', id: entry.id, name: entry.name, mimeType, downloadUrl })
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
const instanceCache: { promise: Promise<PublicClientApplication> | null } = { promise: null }

async function initInstance(clientId: string): Promise<PublicClientApplication> {
  const instance = new PublicClientApplication({
    auth: {
      clientId,
      authority: MICROSOFT_AUTHORITY,
      redirectUri: `${window.location.origin}${MICROSOFT_OAUTH_REDIRECT_PATH}`,
    },
  })
  await instance.initialize()
  return instance
}

/** The shared MSAL instance, created and initialized once per page. */
function getInstance(clientId: string): Promise<PublicClientApplication> {
  instanceCache.promise ??= initInstance(clientId)
  return instanceCache.promise
}

/**
 * A Graph access token with the `Files.Read` scope: reused silently from a
 * cached account when possible, otherwise obtained through an interactive
 * popup. The popup path also runs when the silent attempt reports that
 * interaction is required (a lapsed session or ungranted consent).
 */
export async function acquireGraphToken(clientId: string): Promise<string> {
  const instance = await getInstance(clientId)
  const scopes = [MICROSOFT_GRAPH_SCOPE]
  const account = instance.getAllAccounts()[0]
  if (account !== undefined) {
    try {
      const silent = await instance.acquireTokenSilent({ scopes, account })
      return silent.accessToken
    } catch (error) {
      if (!(error instanceof InteractionRequiredAuthError)) {
        throw error
      }
    }
  }
  const popup = await instance.acquireTokenPopup({ scopes })
  return popup.accessToken
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
  const response = await fetch(oneDriveChildrenUrl(folderId), {
    headers: { [AUTHORIZATION_HEADER]: `${BEARER_PREFIX}${token}` },
  })
  if (!response.ok) {
    throw new Error(`Could not list OneDrive contents (HTTP ${String(response.status)}).`)
  }
  const payload: unknown = await response.json()
  return mapGraphChildren(payload)
}

/**
 * Fetches a chosen image through its pre-authenticated download URL (no auth
 * header) and returns it as a `File` the rest of the app ingests like a local
 * pick.
 */
export async function downloadOneDriveImage(item: OneDriveImage): Promise<File> {
  const response = await fetch(item.downloadUrl)
  if (!response.ok) {
    throw new Error(`Could not download "${item.name}" (HTTP ${String(response.status)}).`)
  }
  const blob = await response.blob()
  return toImageFile(blob, item.name, item.mimeType)
}

/**
 * Graph simple-upload URL for a watermarked photo, addressed by path under the
 * save folder at the drive root. Both path segments are percent-encoded so a
 * name with spaces or reserved characters cannot break out of the path. Pure,
 * so it is unit-tested without a network.
 */
export function oneDriveUploadUrl(name: string): string {
  const folder = encodeURIComponent(CLOUD_SAVE_FOLDER)
  const file = encodeURIComponent(name)
  return `${MICROSOFT_GRAPH_ROOT}/me/drive/root:/${folder}/${file}:/content`
}

/** Content type sent with an upload when the blob does not carry one. */
const DEFAULT_UPLOAD_CONTENT_TYPE = 'application/octet-stream'

/**
 * Writes one watermarked photo to the save folder via Graph's simple upload,
 * creating the folder path if it does not exist. A non-OK response throws with
 * the status so `describeError` can surface it.
 */
export async function uploadOneDriveImage(token: string, upload: CloudUpload): Promise<void> {
  const contentType = upload.blob.type.length > 0 ? upload.blob.type : DEFAULT_UPLOAD_CONTENT_TYPE
  const response = await fetch(oneDriveUploadUrl(upload.name), {
    method: 'PUT',
    headers: {
      [AUTHORIZATION_HEADER]: `${BEARER_PREFIX}${token}`,
      'Content-Type': contentType,
    },
    body: upload.blob,
  })
  if (!response.ok) {
    throw new Error(
      `Could not save "${upload.name}" to OneDrive (HTTP ${String(response.status)}).`,
    )
  }
}

/**
 * Signs in with MSAL (`Files.ReadWrite`) and writes every watermarked photo to
 * the user's OneDrive save folder, in order. Throws a descriptive error when
 * OneDrive is not configured; a failed sign-in or upload rejects with a readable
 * message naming the file.
 */
export async function saveToOneDrive(
  config: PublicConfig,
  uploads: readonly CloudUpload[],
): Promise<void> {
  const clientId = config.microsoftClientId
  if (clientId === null) {
    throw new Error('OneDrive is not configured for this deployment.')
  }
  const token = await acquireGraphToken(clientId)
  for (const upload of uploads) {
    await uploadOneDriveImage(token, upload)
  }
}
