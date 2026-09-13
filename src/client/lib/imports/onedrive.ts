/** OneDrive saves reuse the durable account grant and the chosen destination folder. */
import { cloudTargetToken, type CloudSaveTarget } from './cloud-folders'
import { uploadCloudBatch, type CloudSavedFile } from './cloud-transfer'
import { ensureOneDriveFolder, uploadOneDriveImage } from './onedrive-upload'
import type { CloudUploadSource } from './source'
import type { PublicConfig } from '../../../shared/api'
import { captureCloudOwner } from '../cloud-connection-context'

/** Folder defaults remain compatible for programmatic callers; the UI supplies an explicit destination. */
export async function saveToOneDrive(
  config: PublicConfig,
  uploads: CloudUploadSource,
  target?: CloudSaveTarget,
): Promise<CloudSavedFile[]> {
  if (config.microsoftClientId === null)
    throw new Error('OneDrive is not configured for this deployment.')
  const owner = captureCloudOwner()
  const connection = await cloudTargetToken('onedrive', target)
  const files = typeof uploads === 'function' ? await uploads() : uploads
  owner.assertCurrent()
  if (files.length === 0) return []
  const folderId = target?.folder.id ?? (await ensureOneDriveFolder(connection.accessToken))
  owner.assertCurrent()
  return await uploadCloudBatch(files, async (upload) => {
    const current = await cloudTargetToken('onedrive', connection)
    owner.assertCurrent()
    const saved = await uploadOneDriveImage(current.accessToken, upload, folderId)
    return { ...saved, providerAccountId: current.providerAccountId }
  })
}
