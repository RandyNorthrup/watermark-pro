import type { AssetRecord, PhotoRecord, WatermarkRecord } from './stores'

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
