/** A provider boundary fixture still executes the host's lazy export callback. */
import type { PublicConfig } from '../../shared/api'
import type { CloudSavedFile } from '../lib/imports/cloud-transfer'
import type { CloudProviderId, CloudUpload, CloudUploadSource } from '../lib/imports/source'

export const cloudUploadBatches: (readonly CloudUpload[])[] = []

export function fakeCloudSaver(provider: CloudProviderId) {
  return async (_config: PublicConfig, source: CloudUploadSource): Promise<CloudSavedFile[]> => {
    const files = typeof source === 'function' ? await source() : source
    cloudUploadBatches.push(files)
    return files.map((file, index) => ({
      provider,
      id: `file-${String(index)}`,
      name: file.name,
      manageUrl: 'https://drive.google.com/file/d/test/view',
      userId: 'user-1',
    }))
  }
}
