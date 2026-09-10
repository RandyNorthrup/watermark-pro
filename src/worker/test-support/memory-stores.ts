import {
  ADMIN_ORGANIZATION_PAGE_SIZE,
  CLIENT_ERROR_PAGE_SIZE,
  HEALTH_CHECK_PAGE_SIZE,
  PLATFORM_ADMIN_ROLE,
} from '../../shared/constants'
import type {
  AssetRecord,
  AssetStore,
  ClientErrorRecord,
  HealthCheckRecord,
  ObjectStore,
  ObservabilityStore,
  OrganizationStore,
  PhotoRecord,
  PhotoStore,
  ShareRecord,
  ShareStore,
  StoredObject,
  UserStore,
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
    findMany: (organizationId, ids) =>
      Promise.resolve(scoped(organizationId).filter((record) => ids.includes(record.id))),
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
      if (
        existing === undefined ||
        (patch.expectedUpdatedAt !== undefined &&
          existing.updatedAt.toISOString() !== patch.expectedUpdatedAt)
      ) {
        return Promise.resolve(null)
      }
      const updated: WatermarkRecord = {
        ...existing,
        name: patch.name,
        spec: patch.spec,
        updatedAt: new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1)),
      }
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

/** Records of one organization, newest first with the id as a tie-break (D1 ordering). */
function newestFirst<T extends { id: string; organizationId: string; createdAt: Date }>(
  records: Map<string, T>,
  organizationId: string,
): T[] {
  return records
    .values()
    .filter((record) => record.organizationId === organizationId)
    .toArray()
    .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))
}

/** In-memory photo store for Node tests; mirrors the D1 ordering and cursor. */
export function createMemoryPhotoStore(): PhotoStore {
  const records = new Map<string, PhotoRecord>()
  const scoped = (organizationId: string) => newestFirst(records, organizationId)
  return {
    list(organizationId, query) {
      let rows = scoped(organizationId)
      if (query.presetId !== undefined) {
        rows = rows.filter((record) => record.presetId === query.presetId)
      }
      if (query.search !== undefined && query.search !== '') {
        const needle = query.search.toLowerCase()
        rows = rows.filter((record) => record.name.toLowerCase().includes(needle))
      }
      if (query.cursor !== undefined) {
        const index = rows.findIndex(
          (record) => `${String(record.createdAt.getTime())}:${record.id}` === query.cursor,
        )
        rows = index === -1 ? [] : rows.slice(index + 1)
      }
      const page = rows.slice(0, query.limit)
      const last = page.at(-1)
      return Promise.resolve({
        photos: page,
        nextCursor:
          last !== undefined && rows.length > query.limit
            ? `${String(last.createdAt.getTime())}:${last.id}`
            : null,
      })
    },
    find: (organizationId, id) =>
      Promise.resolve(scoped(organizationId).find((record) => record.id === id) ?? null),
    findMany: (organizationId, ids) =>
      Promise.resolve(scoped(organizationId).filter((record) => ids.includes(record.id))),
    create(input) {
      const record: PhotoRecord = { ...input, createdAt: new Date() }
      records.set(record.id, record)
      return Promise.resolve(record)
    },
    async deleteMany(organizationId, ids) {
      let count = 0
      for (const id of ids) {
        if (await deleteScoped(records, organizationId, id)) {
          count += 1
        }
      }
      return count
    },
    usage(organizationId) {
      const rows = scoped(organizationId)
      return Promise.resolve({
        count: rows.length,
        bytes: rows.reduce((total, record) => total + record.size + (record.thumbnailSize ?? 0), 0),
      })
    },
    usageByOrganization() {
      const usage = new Map<string, { count: number; bytes: number }>()
      for (const record of records.values()) {
        const current = usage.get(record.organizationId) ?? { count: 0, bytes: 0 }
        usage.set(record.organizationId, {
          count: current.count + 1,
          bytes: current.bytes + record.size + (record.thumbnailSize ?? 0),
        })
      }
      return Promise.resolve(usage)
    },
  }
}

/** In-memory share store for Node tests. */
export function createMemoryShareStore(): ShareStore {
  const records = new Map<string, ShareRecord>()
  const scoped = (organizationId: string) => newestFirst(records, organizationId)
  return {
    listForOrganization: (organizationId) => Promise.resolve(scoped(organizationId)),
    find: (organizationId, id) =>
      Promise.resolve(scoped(organizationId).find((record) => record.id === id) ?? null),
    findById: (id) => Promise.resolve(records.get(id) ?? null),
    create(input) {
      const record: ShareRecord = { ...input, revokedAt: null, createdAt: new Date() }
      records.set(record.id, record)
      return Promise.resolve(record)
    },
    revoke(organizationId, id) {
      const existing = scoped(organizationId).find((record) => record.id === id)
      if (existing?.revokedAt !== null) {
        return Promise.resolve(null)
      }
      const revoked = { ...existing, revokedAt: new Date() }
      records.set(id, revoked)
      return Promise.resolve(revoked)
    },
  }
}

/** The rows Better Auth's memory adapter keeps for tenants; shared by reference. */
export interface MemoryTenantTables {
  user: { email: string; role?: string | null }[]
  organization: { id: string; name: string; slug: string; createdAt: Date }[]
  member: { organizationId: string }[]
}

/** Promotes straight in the array Better Auth's memory adapter reads users from. */
export function createMemoryUserStore(tables: Pick<MemoryTenantTables, 'user'>): UserStore {
  return {
    promoteToPlatformAdmin(email) {
      const currentAdmin = tables.user.find((candidate) => candidate.role === PLATFORM_ADMIN_ROLE)
      if (currentAdmin !== undefined && currentAdmin.email !== email) return Promise.resolve(false)
      const row = tables.user.find((candidate) => candidate.email === email)
      if (row === undefined) {
        return Promise.resolve(false)
      }
      row.role = PLATFORM_ADMIN_ROLE
      return Promise.resolve(true)
    },
  }
}

/**
 * Reads tenants straight out of the arrays handed to Better Auth's memory
 * adapter, so the admin routes see the organizations the auth flows created.
 */
export function createMemoryOrganizationStore(tables: MemoryTenantTables): OrganizationStore {
  return {
    listSummaries() {
      const summaries = tables.organization
        .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, ADMIN_ORGANIZATION_PAGE_SIZE)
        .map((row) => ({
          id: row.id,
          name: row.name,
          slug: row.slug,
          createdAt: row.createdAt,
          memberCount: tables.member.filter((entry) => entry.organizationId === row.id).length,
        }))
      return Promise.resolve(summaries)
    },
  }
}

/** In-memory client-error and health-check store for Node tests (newest first). */
export function createMemoryObservabilityStore(): ObservabilityStore {
  const errors: ClientErrorRecord[] = []
  const checks: HealthCheckRecord[] = []
  return {
    recordClientError(input) {
      errors.unshift({ id: crypto.randomUUID(), createdAt: new Date(), ...input })
      return Promise.resolve()
    },
    listClientErrors() {
      return Promise.resolve(errors.slice(0, CLIENT_ERROR_PAGE_SIZE))
    },
    recordHealthCheck(input) {
      checks.unshift({ id: crypto.randomUUID(), createdAt: new Date(), ...input })
      return Promise.resolve()
    },
    listHealthChecks() {
      return Promise.resolve(checks.slice(0, HEALTH_CHECK_PAGE_SIZE))
    },
  }
}
