/**
 * Save watermarked photos back to the member's Google Drive (M16
 * save-to-cloud). The write path reuses the same Google Identity Services (GIS)
 * `drive.file` token the read picker mints — the scope covers both reading files
 * the app opened and writing files the app creates — through the shared
 * `acquireGoogleDriveToken` in `google-picker`, so neither module duplicates the
 * script-load or token dance.
 *
 * One token authorises the whole batch. With it the module ensures a
 * destination folder named `CLOUD_SAVE_FOLDER` exists (a Drive files search,
 * then a create when absent), then POSTs each photo to Drive's multipart upload
 * endpoint: part one is the JSON metadata (`name` + `parents`), part two the
 * image bytes, joined by a unique boundary. The uploads run in order and the
 * call resolves once all succeed; any failure rejects with an Error naming the
 * file and HTTP status.
 *
 * The token flow opens a popup on `accounts.google.com`, so the served page
 * must keep `Cross-Origin-Opener-Policy: same-origin-allow-popups` (already set
 * for the read picker); the upload host is `www.googleapis.com`, which the CSP
 * `connect-src` already allows for the read path. The pure pieces — the folder
 * query, the search URL, and the multipart body — are extracted so they
 * unit-test without the SDK; only the script/token orchestration needs a
 * browser.
 */
import { z } from 'zod'

import {
  cloudFileIdSchema,
  cloudFileName,
  cloudRequest,
  uploadCloudBatch,
  type CloudSavedFile,
} from './cloud-transfer'
import { acquireGoogleDriveToken } from './google-picker'
import type { CloudUpload, CloudUploadSource } from './source'
import type { PublicConfig } from '../../../shared/api'
import {
  CLOUD_SAVE_FOLDER,
  GOOGLE_DRIVE_FILES_ENDPOINT,
  GOOGLE_DRIVE_UPLOAD_ENDPOINT,
} from '../../../shared/constants'
import { captureOfflineOwner } from '../offline-context'

/** Drive's own MIME type for a folder; matching it in a query finds folders only. */
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder'
/** Media type of the JSON metadata part and of the folder-create request body. */
const JSON_MIME_TYPE = 'application/json'
/** Media type for the file part when a blob carries no type of its own. */
const OCTET_STREAM_MIME_TYPE = 'application/octet-stream'
/** `multipart/related` groups the metadata and the bytes into one create request. */
const MULTIPART_RELATED_TYPE = 'multipart/related'
/** Query and request field names the Drive REST API expects. */
const MIME_TYPE_FIELD = 'mimeType'
const NAME_FIELD = 'name'
const TRASHED_FIELD = 'trashed'
/** `uploadType=multipart`: the body carries metadata plus media in one request. */
const UPLOAD_TYPE_PARAM = 'uploadType'
const UPLOAD_TYPE_MULTIPART = 'multipart'
/** Query parameters of the folder lookup: the search expression and a field mask. */
const QUERY_PARAM = 'q'
const FIELDS_PARAM = 'fields'
/** Narrows the lookup response to just the ids of matching files. */
const FOLDER_ID_FIELDS = 'files(id)'
/** Header names and the bearer scheme used on every authenticated request. */
const AUTHORIZATION_HEADER = 'Authorization'
const CONTENT_TYPE_HEADER = 'Content-Type'
const BEARER_PREFIX = 'Bearer '
/** Multipart assembly: the `boundary` directive, its prefix, and the CRLF separator. */
const BOUNDARY_PARAM = 'boundary'
const BOUNDARY_PREFIX = 'wmp-boundary-'
const CRLF = '\r\n'

/** File metadata Drive stores with an uploaded photo: its name and parent folder. */
export interface DriveFileMetadata {
  readonly name: string
  readonly parents: readonly string[]
}

/** A ready-to-send `multipart/related` upload: the body blob plus its content type. */
export interface MultipartUpload {
  readonly boundary: string
  readonly contentType: string
  readonly body: Blob
}

/** A Drive file reference narrowed to just its id (extracted to keep Zod calls shallow). */
const driveFileRefSchema = z.object({ id: cloudFileIdSchema })

/** Only the ids of the matching files are read back from the lookup. */
const folderListSchema = z.object({
  files: z.array(driveFileRefSchema),
})

/** The create-folder response carries the new folder's id. */
const createdFolderSchema = driveFileRefSchema

/** The `Authorization` header carrying the OAuth bearer token. */
function authorizationHeader(accessToken: string): Record<string, string> {
  return { [AUTHORIZATION_HEADER]: `${BEARER_PREFIX}${accessToken}` }
}

/**
 * The Drive query that finds the destination folder by name: a non-trashed
 * folder whose name matches exactly. Single quotes and backslashes in the name
 * are escaped so a name cannot break out of the quoted literal. Pure, so it is
 * unit-tested without a network.
 */
export function buildFolderQuery(folderName: string): string {
  const escaped = folderName.replaceAll('\\', String.raw`\\`).replaceAll("'", String.raw`\'`)
  return `${MIME_TYPE_FIELD} = '${FOLDER_MIME_TYPE}' and ${NAME_FIELD} = '${escaped}' and ${TRASHED_FIELD} = false`
}

/** The Drive files endpoint with the folder-lookup query and field mask applied. Pure. */
export function folderSearchUrl(folderName: string): string {
  const params = new URLSearchParams({
    [QUERY_PARAM]: buildFolderQuery(folderName),
    [FIELDS_PARAM]: FOLDER_ID_FIELDS,
  })
  return `${GOOGLE_DRIVE_FILES_ENDPOINT}?${params.toString()}`
}

/** The multipart upload endpoint with `uploadType=multipart` applied. */
function multipartUploadUrl(): string {
  return `${GOOGLE_DRIVE_UPLOAD_ENDPOINT}?${UPLOAD_TYPE_PARAM}=${UPLOAD_TYPE_MULTIPART}`
}

/**
 * Assemble the `multipart/related` body Drive's upload endpoint expects: a JSON
 * metadata part followed by the raw bytes, separated by a unique boundary (a
 * random UUID that cannot occur in the JSON or the image). Returns the body
 * blob alongside the boundary and the `Content-Type` to send. Pure, so it is
 * unit-tested without a network.
 */
export function buildMultipartBody(metadata: DriveFileMetadata, blob: Blob): MultipartUpload {
  const boundary = `${BOUNDARY_PREFIX}${crypto.randomUUID()}`
  const contentType = `${MULTIPART_RELATED_TYPE}; ${BOUNDARY_PARAM}=${boundary}`
  const mediaType = blob.type.length > 0 ? blob.type : OCTET_STREAM_MIME_TYPE
  const opening =
    `--${boundary}${CRLF}` +
    `${CONTENT_TYPE_HEADER}: ${JSON_MIME_TYPE}${CRLF}${CRLF}` +
    `${JSON.stringify(metadata)}${CRLF}` +
    `--${boundary}${CRLF}` +
    `${CONTENT_TYPE_HEADER}: ${mediaType}${CRLF}${CRLF}`
  const closing = `${CRLF}--${boundary}--`
  const body = new Blob([opening, blob, closing], { type: contentType })
  return { boundary, contentType, body }
}

/**
 * Look up the destination folder by name and return its id, or null when no
 * such folder exists. A non-OK response rejects with a readable Error.
 */
export async function findFolderId(
  accessToken: string,
  folderName: string,
): Promise<string | null> {
  return await cloudRequest(
    folderSearchUrl(folderName),
    {
      headers: authorizationHeader(accessToken),
    },
    async (response) => {
      if (!response.ok) {
        throw new Error(
          `Could not search Google Drive for the "${folderName}" folder (HTTP ${String(response.status)}).`,
        )
      }
      const payload: unknown = await response.json()
      const { files } = folderListSchema.parse(payload)
      return files[0]?.id ?? null
    },
  )
}

/**
 * Create the destination folder and return its id. A non-OK response rejects
 * with a readable Error.
 */
export async function createFolder(accessToken: string, folderName: string): Promise<string> {
  return await cloudRequest(
    GOOGLE_DRIVE_FILES_ENDPOINT,
    {
      method: 'POST',
      headers: { ...authorizationHeader(accessToken), [CONTENT_TYPE_HEADER]: JSON_MIME_TYPE },
      body: JSON.stringify({ name: folderName, mimeType: FOLDER_MIME_TYPE }),
    },
    async (response) => {
      if (!response.ok) {
        throw new Error(
          `Could not create the "${folderName}" folder in Google Drive (HTTP ${String(response.status)}).`,
        )
      }
      const payload: unknown = await response.json()
      return createdFolderSchema.parse(payload).id
    },
  )
}

/** Find the destination folder, creating it when it does not yet exist. */
async function ensureSaveFolder(accessToken: string): Promise<string> {
  const existing = await findFolderId(accessToken, CLOUD_SAVE_FOLDER)
  return existing ?? (await createFolder(accessToken, CLOUD_SAVE_FOLDER))
}

/**
 * Upload one watermarked photo into the destination folder via the multipart
 * endpoint. A non-OK response rejects with an Error naming the file and status.
 */
export async function uploadFile(
  accessToken: string,
  folderId: string,
  upload: CloudUpload,
): Promise<CloudSavedFile> {
  const owner = captureOfflineOwner()
  const name = cloudFileName(upload.name)
  const { contentType, body } = buildMultipartBody({ name, parents: [folderId] }, upload.blob)
  return await cloudRequest(
    multipartUploadUrl(),
    {
      method: 'POST',
      headers: { ...authorizationHeader(accessToken), [CONTENT_TYPE_HEADER]: contentType },
      body,
    },
    async (response) => {
      if (!response.ok) {
        throw new Error(
          `Could not save ${upload.name} to Google Drive (HTTP ${String(response.status)}).`,
        )
      }
      const payload: unknown = await response.json()
      const file = driveFileRefSchema.parse(payload)
      return {
        provider: 'google',
        id: file.id,
        name,
        manageUrl: `https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`,
        userId: owner.userId,
      }
    },
  )
}

/**
 * Save the given watermarked photos to the member's Google Drive, into a folder
 * named `CLOUD_SAVE_FOLDER` (created when missing). Acquires one `drive.file`
 * token for the whole batch through the shared GIS popup flow (in
 * `google-picker`, so the read and write paths never duplicate it), then uploads
 * the files in order, resolving once all succeed. Throws when the deployment has
 * not configured Google's client id or when the browser globals are unavailable;
 * rejects with a readable Error (naming the file and HTTP status) on the first
 * failed upload.
 */
export async function saveToGoogleDrive(
  config: PublicConfig,
  uploads: CloudUploadSource,
): Promise<CloudSavedFile[]> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Saving to Google Drive is only available in a browser.')
  }
  const clientId = config.googleOAuthClientId
  if (clientId === null) {
    throw new Error('Google Drive save is not configured for this deployment.')
  }

  const owner = captureOfflineOwner()
  const accessToken = await acquireGoogleDriveToken(clientId)
  owner.assertCurrent()
  const files = typeof uploads === 'function' ? await uploads() : uploads
  owner.assertCurrent()
  if (files.length === 0) return []
  const folderId = await ensureSaveFolder(accessToken)
  owner.assertCurrent()
  return await uploadCloudBatch(files, (upload) => uploadFile(accessToken, folderId, upload))
}
