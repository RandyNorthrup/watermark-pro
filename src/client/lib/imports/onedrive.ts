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
 * auth header. The URL builder and the mapper are pure and unit-tested; the
 * MSAL and network glue is exercised by the browser, not here.
 */
import { InteractionRequiredAuthError, PublicClientApplication } from '@azure/msal-browser'
import { z } from 'zod'

import { toImageFile } from './download'
import {
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
