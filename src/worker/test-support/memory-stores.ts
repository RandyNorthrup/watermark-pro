import type {
  AssetRecord,
  AssetStore,
  ObjectStore,
  StoredObject,
  WatermarkRecord,
  WatermarkStore,
} from '../stores'

/** Removes `id` when it belongs to the organization; reports whether it did. */
function deleteScoped<T extends { id: string; organizationId: string }>(
  records: Map<string, T>,
  organizationId: string,
  id: string,
): Promise<boolean> {
  if (records.get(id)?.organizationId !== organizationId) {
    return Promise.resolve(false)
  }
  records.delete(id)
  return Promise.resolve(true)
}

/** In-memory preset store for Node tests. */
export function createMemoryWatermarkStore(): WatermarkStore {
  const records = new Map<string, WatermarkRecord>()
  const scoped = (organizationId: string) =>
    records
      .values()
      .filter((record) => record.organizationId === organizationId)
      .toArray()
  return {
    listForOrganization: (organizationId) => Promise.resolve(scoped(organizationId)),
    find: (organizationId, id) =>
      Promise.resolve(scoped(organizationId).find((record) => record.id === id) ?? null),
    create(input) {
      const now = new Date()
      const record: WatermarkRecord = { ...input, createdAt: now, updatedAt: now }
      records.set(record.id, record)
      return Promise.resolve(record)
    },
    update(organizationId, id, patch) {
      const existing = scoped(organizationId).find((record) => record.id === id)
      if (existing === undefined) {
        return Promise.resolve(null)
      }
      const updated: WatermarkRecord = { ...existing, ...patch, updatedAt: new Date() }
      records.set(id, updated)
      return Promise.resolve(updated)
    },
    delete: (organizationId, id) => deleteScoped(records, organizationId, id),
    countReferencingAsset: (organizationId, assetId) =>
      Promise.resolve(
        scoped(organizationId).filter(
          (record) => record.spec.kind === 'image' && record.spec.assetId === assetId,
        ).length,
      ),
  }
}

/** In-memory asset metadata store for Node tests. */
export function createMemoryAssetStore(): AssetStore {
  const records = new Map<string, AssetRecord>()
  const scoped = (organizationId: string, kind?: string) =>
    records
      .values()
      .filter(
        (record) =>
          record.organizationId === organizationId && (kind === undefined || record.kind === kind),
      )
      .toArray()
  return {
    listForOrganization: (organizationId, kind) => Promise.resolve(scoped(organizationId, kind)),
    find: (organizationId, id) =>
      Promise.resolve(scoped(organizationId).find((record) => record.id === id) ?? null),
    create(input) {
      const record: AssetRecord = { ...input, createdAt: new Date() }
      records.set(record.id, record)
      return Promise.resolve(record)
    },
    delete: (organizationId, id) => deleteScoped(records, organizationId, id),
    countForOrganization: (organizationId, kind) =>
      Promise.resolve(scoped(organizationId, kind).length),
  }
}

/** In-memory object store for Node tests. */
export function createMemoryObjectStore(): ObjectStore & { keys(): string[] } {
  const objects = new Map<string, { bytes: ArrayBuffer; contentType: string }>()
  return {
    keys: () => objects.keys().toArray(),
    put(key, body, contentType) {
      objects.set(key, { bytes: body, contentType })
      return Promise.resolve()
    },
    get(key) {
      const stored = objects.get(key)
      if (stored === undefined) {
        return Promise.resolve(null)
      }
      const result: StoredObject = {
        body: new Blob([stored.bytes]).stream(),
        contentType: stored.contentType,
        size: stored.bytes.byteLength,
      }
      return Promise.resolve(result)
    },
    delete(key) {
      objects.delete(key)
      return Promise.resolve()
    },
  }
}
