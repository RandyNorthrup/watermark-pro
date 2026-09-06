import type { AssetRecord, WatermarkRecord } from './stores'

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
