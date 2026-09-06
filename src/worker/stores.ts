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
  create(input: Omit<WatermarkRecord, 'createdAt' | 'updatedAt'>): Promise<WatermarkRecord>
  update(
    organizationId: string,
    id: string,
    patch: { name: string; spec: WatermarkSpec },
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
