import { z } from 'zod'

import {
  cachedRecordSchema,
  pendingOperationSchema,
  type CachedRecord,
  type NewOperation,
  type PendingOperation,
} from './offline-model'

const BINARY_FORMAT = 'lumafoil-binary-v1'
const storedBinarySchema = z
  .object({ format: z.literal(BINARY_FORMAT), type: z.string(), bytes: z.instanceof(ArrayBuffer) })
  .strict()

/** ArrayBuffer avoids WebKit's file-backed Blob storage failures without base64 expansion. */
async function encodeBlob(blob: Blob) {
  return { format: BINARY_FORMAT, type: blob.type, bytes: await blob.arrayBuffer() }
}

function decodeBlob(value: unknown): unknown {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('format' in value) ||
    value.format !== BINARY_FORMAT
  )
    return value
  const stored = storedBinarySchema.parse(value)
  return new Blob([stored.bytes], { type: stored.type })
}

/** Existing Blob records remain readable; newly written media uses the versioned binary envelope. */
export async function encodeOfflineRecord(record: CachedRecord) {
  return {
    ...record,
    value: record.value instanceof Blob ? await encodeBlob(record.value) : record.value,
  }
}

export function decodeOfflineRecord(value: unknown): CachedRecord {
  const record = cachedRecordSchema.parse(value)
  return { ...record, value: decodeBlob(record.value) }
}

/** Binary reads finish before opening a write transaction, which must never await Blob I/O. */
export async function encodeOfflineOperation(operation: NewOperation | PendingOperation) {
  const change = operation.change
  if (change.kind === 'photo-upload') {
    const [blob, thumbnail] = await Promise.all([
      encodeBlob(change.blob),
      encodeBlob(change.thumbnail),
    ])
    return { ...operation, change: { ...change, blob, thumbnail } }
  }
  if (change.kind === 'logo-upload')
    return { ...operation, change: { ...change, blob: await encodeBlob(change.blob) } }
  return operation
}

export function decodeOfflineOperation(value: unknown): PendingOperation {
  if (
    typeof value === 'object' &&
    value !== null &&
    'change' in value &&
    typeof value.change === 'object' &&
    value.change !== null &&
    'kind' in value.change &&
    'blob' in value.change
  ) {
    const change = value.change
    if (change.kind === 'photo-upload' && 'thumbnail' in change)
      return pendingOperationSchema.parse({
        ...value,
        change: {
          ...change,
          blob: decodeBlob(change.blob),
          thumbnail: decodeBlob(change.thumbnail),
        },
      })
    if (change.kind === 'logo-upload')
      return pendingOperationSchema.parse({
        ...value,
        change: { ...change, blob: decodeBlob(change.blob) },
      })
  }
  return pendingOperationSchema.parse(value)
}
