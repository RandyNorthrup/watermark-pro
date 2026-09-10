/** Download the active workspace's editing data before promising offline readiness. */
import { cachedWorkspaceJson } from './offline-cache'
import { offlineUserId } from './offline-context'
import { offlineRecordKey, readOfflineRecord } from './offline-database'
import { loadWorkspaceMedia } from './offline-media'
import { workspaceCacheReconciliation } from './offline-reconciliation'
import {
  assetListResponseSchema,
  photoListResponseSchema,
  storageUsageSchema,
} from '../../shared/api'
import { watermarkListResponseSchema } from '../../shared/api-watermark'

/** Gallery media is retained when opened or saved; preset logos are prepared eagerly. */
export async function prepareWorkspaceOffline(organizationId: string): Promise<void> {
  const root = `/api/orgs/${organizationId}`
  const paths = [`${root}/watermarks`, `${root}/assets`, `${root}/photos`, `${root}/photos/usage`]
  const reconcilePhotos = await workspaceCacheReconciliation(organizationId, 'photo')
  const reconcilePresets = await workspaceCacheReconciliation(organizationId, 'preset')
  const reconcileLogos = await workspaceCacheReconciliation(organizationId, 'logo')
  const photoRead = { isFallback: false }
  const markPhotoFallback = () => {
    photoRead.isFallback = true
  }
  const [, assets, firstPage] = await Promise.all([
    cachedWorkspaceJson(
      organizationId,
      `${root}/watermarks`,
      watermarkListResponseSchema,
      async (value) =>
        await reconcilePresets(
          value.watermarks.map((preset) => preset.id),
          true,
        ),
    ),
    cachedWorkspaceJson(
      organizationId,
      `${root}/assets`,
      assetListResponseSchema,
      async (value) =>
        await reconcileLogos(
          value.assets.map((asset) => asset.id),
          true,
        ),
    ),
    cachedWorkspaceJson(
      organizationId,
      `${root}/photos`,
      photoListResponseSchema,
      undefined,
      markPhotoFallback,
    ),
    cachedWorkspaceJson(organizationId, `${root}/photos/usage`, storageUsageSchema),
  ])
  const photoIds = firstPage.photos.map((photo) => photo.id)
  const cursors = new Set<string>()
  let cursor = firstPage.nextCursor
  while (cursor !== null) {
    if (cursors.has(cursor)) {
      throw new Error('Gallery preparation received a repeated page. Reconnect and retry.')
    }
    cursors.add(cursor)
    const path = `${root}/photos?cursor=${encodeURIComponent(cursor)}`
    const page = await cachedWorkspaceJson(
      organizationId,
      path,
      photoListResponseSchema,
      undefined,
      markPhotoFallback,
    )
    paths.push(path)
    photoIds.push(...page.photos.map((photo) => photo.id))
    cursor = page.nextCursor
  }
  if (!photoRead.isFallback) {
    await reconcilePhotos(photoIds, true)
  }
  for (const asset of assets.assets) {
    const path = `${root}/assets/${asset.id}/file`
    await loadWorkspaceMedia(organizationId, path)
    paths.push(path)
  }
  const userId = offlineUserId()
  for (const path of paths) {
    const record = await readOfflineRecord(offlineRecordKey(userId, organizationId, path))
    if (record === null) {
      throw new Error('Workspace preparation could not be saved. Check available device storage.')
    }
  }
}
