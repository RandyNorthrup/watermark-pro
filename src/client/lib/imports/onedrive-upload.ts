/** Graph upload sessions preserve existing names and send bounded, aligned chunks. */
import { z } from 'zod'

import {
  cloudFileIdSchema,
  cloudFileName,
  cloudRequest,
  trustedCloudUrl,
  type CloudSavedFile,
} from './cloud-transfer'
import type { CloudUpload } from './source'
import { CLOUD_SAVE_FOLDER, HTTP_STATUS, MICROSOFT_GRAPH_ROOT } from '../../../shared/constants'
import { captureOfflineOwner } from '../offline-context'

const CONFLICT_BEHAVIOR = '@microsoft.graph.conflictBehavior'
/** Sixteen 320KiB blocks; Graph requires aligned fragments below 60MiB. */
const CHUNK_BYTES = 5_242_880
const UPLOAD_ACCEPTED_STATUS = 202
const FILE_HOSTS = ['up.1drv.com', 'my.microsoftpersonalcontent.com', 'sharepoint.com']
const WEB_HOSTS = ['onedrive.live.com', '1drv.ms', 'sharepoint.com']
const folderSchema = z.object({ id: cloudFileIdSchema, folder: z.record(z.string(), z.unknown()) })
const savedSchema = z.object({ id: cloudFileIdSchema, name: z.string().min(1), webUrl: z.string() })

async function findFolder(token: string): Promise<string | null> {
  return await cloudRequest(
    `${MICROSOFT_GRAPH_ROOT}/me/drive/root:/${encodeURIComponent(CLOUD_SAVE_FOLDER)}`,
    { headers: { Authorization: `Bearer ${token}` } },
    async (response) => {
      if (response.status === HTTP_STATUS.notFound) return null
      if (!response.ok)
        throw new Error(
          `Could not open the OneDrive save folder (HTTP ${String(response.status)}).`,
        )
      return folderSchema.parse(await response.json()).id
    },
  )
}

/** Create the actual folder before addressing its children; tolerate only a concurrent folder creation. */
export async function ensureOneDriveFolder(token: string): Promise<string> {
  const owner = captureOfflineOwner()
  const existing = await findFolder(token)
  owner.assertCurrent()
  if (existing !== null) return existing
  return await cloudRequest(
    `${MICROSOFT_GRAPH_ROOT}/me/drive/root/children`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: CLOUD_SAVE_FOLDER, folder: {}, [CONFLICT_BEHAVIOR]: 'fail' }),
    },
    async (response) => {
      if (response.status === HTTP_STATUS.conflict) {
        const raced = await findFolder(token)
        if (raced !== null) return raced
      }
      if (!response.ok)
        throw new Error(
          `Could not create the OneDrive save folder (HTTP ${String(response.status)}).`,
        )
      return folderSchema.parse(await response.json()).id
    },
  )
}

/** Only a validated filename may be appended to a parent ID. */
export function oneDriveUploadUrl(name: string, folderId: string): string {
  return `${MICROSOFT_GRAPH_ROOT}/me/drive/items/${encodeURIComponent(folderId)}:/${encodeURIComponent(cloudFileName(name))}:/createUploadSession`
}

/** Require a final driveItem acknowledgement; an incomplete session is never a saved file. */
export async function uploadOneDriveImage(
  token: string,
  upload: CloudUpload,
  folderId: string,
): Promise<CloudSavedFile> {
  const owner = captureOfflineOwner()
  const name = cloudFileName(upload.name)
  if (upload.blob.size === 0) throw new Error(`"${name}" is empty and cannot be saved.`)
  const uploadUrl = await cloudRequest(
    oneDriveUploadUrl(name, folderId),
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: { name, [CONFLICT_BEHAVIOR]: 'rename' } }),
    },
    async (response) => {
      if (!response.ok)
        throw new Error(
          `Could not prepare "${name}" in OneDrive (HTTP ${String(response.status)}).`,
        )
      const session = z.object({ uploadUrl: z.string() }).parse(await response.json())
      return trustedCloudUrl(session.uploadUrl, FILE_HOSTS)
    },
  )
  for (let offset = 0; offset < upload.blob.size; offset += CHUNK_BYTES) {
    owner.assertCurrent()
    const end = Math.min(offset + CHUNK_BYTES, upload.blob.size)
    const result = await cloudRequest(
      uploadUrl,
      {
        method: 'PUT',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        headers: {
          'Content-Range': `bytes ${String(offset)}-${String(end - 1)}/${String(upload.blob.size)}`,
        },
        body: upload.blob.slice(offset, end),
      },
      async (response) => {
        if (!response.ok)
          throw new Error(`Could not save "${name}" to OneDrive (HTTP ${String(response.status)}).`)
        const payload: unknown = await response.json()
        if (response.status === UPLOAD_ACCEPTED_STATUS) {
          const progress = z
            .object({ nextExpectedRanges: z.array(z.string()).min(1) })
            .parse(payload)
          if (progress.nextExpectedRanges[0] !== `${String(end)}-`)
            throw new Error('OneDrive did not acknowledge the expected upload range.')
          return null
        }
        return savedSchema.parse(payload)
      },
    )
    owner.assertCurrent()
    if (result !== null) {
      if (end !== upload.blob.size)
        throw new Error('OneDrive completed an incomplete upload unexpectedly.')
      return {
        provider: 'onedrive',
        id: result.id,
        name: result.name,
        manageUrl: trustedCloudUrl(result.webUrl, WEB_HOSTS),
        userId: owner.userId,
      }
    }
  }
  throw new Error('OneDrive did not confirm the completed upload. Check the drive before retrying.')
}
