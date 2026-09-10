/**
 * Storage interfaces the routes depend on. D1 and R2 implementations live in
 * `db/`; in-memory implementations in `test-support/` let the Node tests run
 * real routes and real Better Auth without Cloudflare bindings.
 */
import type { WatermarkSpec } from '../shared/watermark'

export interface WatermarkRecord {
  id: string
  organizationId: string
  name: string
  spec: WatermarkSpec
  createdBy: string | null
  createdAt: Date
  updatedAt: Date
}

export interface WatermarkStore {
  listForOrganization(organizationId: string): Promise<WatermarkRecord[]>
  find(organizationId: string, id: string): Promise<WatermarkRecord | null>
  findMany(organizationId: string, ids: readonly string[]): Promise<WatermarkRecord[]>
  create(input: Omit<WatermarkRecord, 'createdAt' | 'updatedAt'>): Promise<WatermarkRecord>
  update(
    organizationId: string,
    id: string,
    patch: { name: string; spec: WatermarkSpec; expectedUpdatedAt?: string | undefined },
  ): Promise<WatermarkRecord | null>
  delete(organizationId: string, id: string): Promise<boolean>
  /** Presets whose image mark references the asset. */
  countReferencingAsset(organizationId: string, assetId: string): Promise<number>
}

/** Only logos so far; photos (M6) will get their own kind. */
export type AssetKind = 'logo'

export interface AssetRecord {
  id: string
  organizationId: string
  kind: AssetKind
  name: string
  key: string
  contentType: string
  size: number
  width: number
  height: number
  createdBy: string | null
  createdAt: Date
}

export interface AssetStore {
  listForOrganization(organizationId: string, kind: AssetKind): Promise<AssetRecord[]>
  find(organizationId: string, id: string): Promise<AssetRecord | null>
  create(input: Omit<AssetRecord, 'createdAt'>): Promise<AssetRecord>
  delete(organizationId: string, id: string): Promise<boolean>
  countForOrganization(organizationId: string, kind: AssetKind): Promise<number>
}

export interface StoredObject {
  body: ReadableStream
  contentType: string
  size: number
}

/** Binary storage keyed by path; R2 in production. */
export interface ObjectStore {
  put(key: string, body: ArrayBuffer, contentType: string): Promise<void>
  get(key: string): Promise<StoredObject | null>
  delete(key: string): Promise<void>
}

export interface PhotoRecord {
  id: string
  organizationId: string
  name: string
  key: string
  thumbnailKey: string
  /** Actual thumbnail bytes; legacy internal fixtures can omit a thumbnail. */
  thumbnailSize?: number | undefined
  contentType: string
  size: number
  width: number
  height: number
  presetId: string | null
  presetName: string | null
  createdBy: string | null
  createdAt: Date
}

export interface PhotoPage {
  photos: PhotoRecord[]
  /** Opaque cursor for the next page; null on the last page. */
  nextCursor: string | null
}

export interface PhotoQuery {
  presetId?: string | undefined
  /** Case-insensitive substring of the name. */
  search?: string | undefined
  cursor?: string | undefined
  limit: number
}

export interface StorageUsage {
  count: number
  bytes: number
}

export interface PhotoStore {
  list(organizationId: string, query: PhotoQuery): Promise<PhotoPage>
  find(organizationId: string, id: string): Promise<PhotoRecord | null>
  findMany(organizationId: string, ids: readonly string[]): Promise<PhotoRecord[]>
  create(input: Omit<PhotoRecord, 'createdAt'>): Promise<PhotoRecord>
  deleteMany(organizationId: string, ids: readonly string[]): Promise<number>
  usage(organizationId: string): Promise<StorageUsage>
  /** Usage of every organization that has photos, keyed by organization id. */
  usageByOrganization(): Promise<Map<string, StorageUsage>>
}

export interface ShareRecord {
  id: string
  organizationId: string
  title: string
  photoIds: string[]
  /** Unix seconds; 0 means the link never expires. */
  expiresAt: number
  revokedAt: Date | null
  createdBy: string | null
  createdAt: Date
}

export interface ShareStore {
  listForOrganization(organizationId: string): Promise<ShareRecord[]>
  find(organizationId: string, id: string): Promise<ShareRecord | null>
  /** Lookup by id alone, for the public route (the token proves the id). */
  findById(id: string): Promise<ShareRecord | null>
  create(input: Omit<ShareRecord, 'createdAt' | 'revokedAt'>): Promise<ShareRecord>
  revoke(organizationId: string, id: string): Promise<ShareRecord | null>
}

/** One tenant as the platform admin console sees it. */
export interface OrganizationSummary {
  id: string
  name: string
  slug: string | null
  createdAt: Date
  memberCount: number
}

export interface OrganizationStore {
  /**
   * Newest first, capped at `ADMIN_ORGANIZATION_PAGE_SIZE`. Member counts
   * are aggregated in the store so no row limit can silently truncate them
   * (Better Auth's adapter `findMany` stops at 100 rows by default).
   */
  listSummaries(): Promise<OrganizationSummary[]>
}

export interface UserStore {
  /**
   * Establishes the immutable site owner for this email in a disposable test
   * database. Never reachable in production or usable to select a second owner.
   * Resolves false when no such account exists.
   */
  promoteToSiteOwner(email: string): Promise<boolean>
}

export interface ClientErrorRecord {
  id: string
  message: string
  source: string | null
  route: string | null
  userAgent: string | null
  requestId: string | null
  userId: string | null
  createdAt: Date
}

export interface HealthCheckRecord {
  id: string
  ok: boolean
  detail: string | null
  durationMs: number
  createdAt: Date
}

/**
 * Client error reports and scheduled health checks (M19 observability). Both
 * are append-only from the app's point of view; writes prune rows past the
 * retention window so the tables cannot grow without bound.
 */
export interface ObservabilityStore {
  recordClientError(input: Omit<ClientErrorRecord, 'id' | 'createdAt'>): Promise<void>
  listClientErrors(): Promise<ClientErrorRecord[]>
  recordHealthCheck(input: Omit<HealthCheckRecord, 'id' | 'createdAt'>): Promise<void>
  listHealthChecks(): Promise<HealthCheckRecord[]>
}
