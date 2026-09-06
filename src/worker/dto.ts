import type { AuditRecord } from './audit'
import { NEVER_EXPIRES } from './share-token'
import type { AssetRecord, PhotoRecord, ShareRecord, WatermarkRecord } from './stores'
import { MILLISECONDS_PER_SECOND } from '../shared/constants'

/** Serialisation shared by routes: dates become ISO strings, storage keys stay private. */
export function watermarkToDto(record: WatermarkRecord) {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  }
}

export function assetToDto(record: AssetRecord) {
  const { key: _key, ...rest } = record
  return { ...rest, createdAt: record.createdAt.toISOString() }
}

export function photoToDto(record: PhotoRecord) {
  const { key: _key, thumbnailKey: _thumbnailKey, ...rest } = record
  return { ...rest, createdAt: record.createdAt.toISOString() }
}

export function shareToDto(record: ShareRecord, url: string) {
  return {
    id: record.id,
    organizationId: record.organizationId,
    title: record.title,
    photoCount: record.photoIds.length,
    expiresAt:
      record.expiresAt === NEVER_EXPIRES
        ? null
        : new Date(record.expiresAt * MILLISECONDS_PER_SECOND).toISOString(),
    revokedAt: record.revokedAt?.toISOString() ?? null,
    createdBy: record.createdBy,
    createdAt: record.createdAt.toISOString(),
    url,
  }
}

export function auditToDto(record: AuditRecord) {
  return {
    id: record.id,
    organizationId: record.organizationId ?? null,
    actorUserId: record.actorUserId ?? null,
    actorName: record.actorName ?? null,
    action: record.action,
    targetType: record.targetType,
    targetId: record.targetId ?? null,
    metadata: record.metadata ?? null,
    createdAt: record.createdAt.toISOString(),
  }
}
