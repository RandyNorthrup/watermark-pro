import { z } from 'zod'

import {
  cloudFileIdSchema,
  cloudFileName,
  cloudRequest,
  trustedCloudUrl,
  type CloudSavedFile,
} from './cloud-transfer'
import type { CloudUpload } from './source'
import { GOOGLE_DRIVE_UPLOAD_ENDPOINT } from '../../../shared/constants'
import { captureCloudOwner } from '../cloud-connection-context'

/** Google recommends resumable upload for media larger than 5MiB. */
export const GOOGLE_SIMPLE_UPLOAD_BYTES = 5_242_880
const CHUNK_BYTES = 8_388_608
const RESUME_INCOMPLETE = 308
const savedSchema = z.object({ id: cloudFileIdSchema, name: z.string().optional() })

/** Large PDFs and videos use aligned resumable chunks, preserving bytes and requiring a final file acknowledgement. */
export async function uploadResumableGoogleFile(
  token: string,
  folderId: string,
  upload: CloudUpload,
): Promise<CloudSavedFile> {
  const owner = captureCloudOwner()
  const name = cloudFileName(upload.name)
  if (upload.blob.size === 0) throw new Error('An empty file cannot be saved to Google Drive.')
  const location = await cloudRequest(
    `${GOOGLE_DRIVE_UPLOAD_ENDPOINT}?uploadType=resumable&supportsAllDrives=true`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': upload.blob.type || 'application/octet-stream',
        'X-Upload-Content-Length': String(upload.blob.size),
      },
      body: JSON.stringify({ name, parents: [folderId] }),
    },
    (response) => {
      if (!response.ok)
        throw new Error(
          `Google Drive could not start the upload (HTTP ${String(response.status)}).`,
        )
      const value = response.headers.get('location')
      if (value === null) throw new Error('Google Drive did not return an upload location.')
      const url = new URL(trustedCloudUrl(value, ['www.googleapis.com']))
      const expected = new URL(GOOGLE_DRIVE_UPLOAD_ENDPOINT)
      if (url.origin !== expected.origin || url.pathname !== expected.pathname)
        throw new Error('Google Drive returned an unexpected upload location.')
      return Promise.resolve(url.href)
    },
  )
  for (let offset = 0; offset < upload.blob.size; offset += CHUNK_BYTES) {
    owner.assertCurrent()
    const end = Math.min(offset + CHUNK_BYTES, upload.blob.size)
    const saved = await cloudRequest(
      location,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': upload.blob.type || 'application/octet-stream',
          'Content-Range': `bytes ${String(offset)}-${String(end - 1)}/${String(upload.blob.size)}`,
        },
        body: upload.blob.slice(offset, end),
      },
      async (response) => {
        if (response.status === RESUME_INCOMPLETE) {
          if (response.headers.get('range') !== `bytes=0-${String(end - 1)}`)
            throw new Error('Google Drive did not acknowledge the expected upload range.')
          return null
        }
        if (!response.ok)
          throw new Error(
            `Google Drive could not save this file (HTTP ${String(response.status)}).`,
          )
        return savedSchema.parse(await response.json())
      },
    )
    owner.assertCurrent()
    if (saved !== null) {
      if (end !== upload.blob.size)
        throw new Error('Google Drive confirmed an incomplete file unexpectedly.')
      return {
        provider: 'google',
        id: saved.id,
        name: saved.name ?? name,
        manageUrl: `https://drive.google.com/file/d/${encodeURIComponent(saved.id)}/view`,
        userId: owner.userId,
      }
    }
  }
  throw new Error(
    'Google Drive did not confirm the complete file. Check the provider before retrying.',
  )
}
