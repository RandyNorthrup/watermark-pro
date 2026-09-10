/** Network-validated data with a scoped durable fallback when the connection is unavailable. */
import type { ZodType } from 'zod'

import { fetchJson } from './api'
import { captureOfflineOwner, hasOfflineDatabase } from './offline-context'
import { cacheOfflineRecord, offlineRecordKey, readOfflineRecord } from './offline-database'
import { updateOfflineStatus } from './offline-status'

/** Offline cache keys always include the signed-in account and organization. */
export async function cachedWorkspaceJson<T>(
  organizationId: string,
  path: string,
  schema: ZodType<T>,
  onCached?: (value: T) => Promise<void>,
  onFallback?: () => void,
): Promise<T> {
  if (!hasOfflineDatabase()) {
    return await fetchJson(path, schema)
  }
  const owner = captureOfflineOwner()
  const { userId } = owner
  const key = offlineRecordKey(userId, organizationId, path)
  try {
    if (!navigator.onLine) {
      throw new TypeError('The device is offline.')
    }
    const value = await fetchJson(path, schema)
    owner.assertCurrent()
    try {
      await cacheOfflineRecord({ key, userId, organizationId, value })
      owner.assertCurrent()
      await onCached?.(value)
    } catch {
      updateOfflineStatus({
        problem: 'Device storage is unavailable. This page is not saved for offline use.',
      })
    }
    owner.assertCurrent()
    return value
  } catch (error) {
    if (!(error instanceof TypeError)) {
      throw error
    }
    const cached = await readOfflineRecord(key)
    owner.assertCurrent()
    if (cached?.userId !== userId || cached.organizationId !== organizationId) {
      throw new Error('Connect once to make this workspace available offline.', { cause: error })
    }
    const value = schema.parse(cached.value)
    onFallback?.()
    return value
  }
}
