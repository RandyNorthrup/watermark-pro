/** A durable upload reservation is also the recovery record for abandoned R2 objects. */
import type { AuditEntry } from './audit'
import type { AssetRecord, PhotoRecord, StorageUsage } from './stores'

export const UPLOAD_POLICY = {
  leaseMs: 300_000,
  cleanupBatch: 20,
} as const

export interface UploadReservation {
  id: string
  organizationId: string
  uploadId: string
  kind: 'photo' | 'logo'
  userId: string
  fingerprint: string
  keys: string[]
  bytes: number
  expiresAt: Date
}

export type UploadRecord =
  | { kind: 'photo'; value: Omit<PhotoRecord, 'createdAt'> }
  | { kind: 'logo'; value: Omit<AssetRecord, 'createdAt'> }

export type ReservationResult =
  'reserved' | 'pending' | 'existing' | 'deleted' | 'conflict' | 'quota'

/** All ownership-changing writes use the unique reservation id as a fencing token. */
export interface UploadStore {
  reserve(reservation: UploadReservation): Promise<ReservationResult>
  commit(reservation: UploadReservation, record: UploadRecord, audit: AuditEntry): Promise<boolean>
  abandon(reservationId: string): Promise<void>
  cleanupCandidates(organizationId?: string): Promise<UploadReservation[]>
  release(reservationId: string): Promise<void>
  /** Removes accessible metadata and persists cleanup before any physical deletion. */
  deletePhotos(organizationId: string, ids: readonly string[], audit: AuditEntry): Promise<number>
  deleteLogo(organizationId: string, id: string, audit: AuditEntry): Promise<boolean>
  usage(organizationId: string): Promise<StorageUsage>
  usageByOrganization(): Promise<Map<string, StorageUsage>>
  hasContent(organizationId: string): Promise<boolean>
}
