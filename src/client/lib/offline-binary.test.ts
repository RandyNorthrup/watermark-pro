import { describe, expect, it } from 'vitest'

import {
  decodeOfflineOperation,
  decodeOfflineRecord,
  encodeOfflineOperation,
  encodeOfflineRecord,
} from './offline-binary'
import { offlineRecordKey } from './offline-database'
import {
  OFFLINE_ORG,
  OFFLINE_USER,
  offlineAsset,
  offlineOperation,
  offlinePhoto,
  offlinePreset,
} from '../test-support/offline-fixtures'

/** jsdom omits Blob.arrayBuffer; real browser byte round-trips cover the native implementation. */
function blob(bytes: number[], type: string) {
  const value = new Blob([new Uint8Array(bytes)], { type })
  return Object.assign(value, { arrayBuffer: () => Promise.resolve(new Uint8Array(bytes).buffer) })
}

describe('portable IndexedDB binary envelopes', () => {
  it('preserves media bytes and MIME without base64, while still reading older Blob records', async () => {
    const bytes = [0, 1, 128, 255]
    const original = blob(bytes, 'image/png')
    const record = {
      key: offlineRecordKey(OFFLINE_USER, OFFLINE_ORG, 'image'),
      userId: OFFLINE_USER,
      organizationId: OFFLINE_ORG,
      value: original,
    }
    const encoded = await encodeOfflineRecord(record)
    expect(encoded.value).not.toBeInstanceOf(Blob)
    expect(encoded.value).toMatchObject({
      format: 'lumafoil-binary-v1',
      type: 'image/png',
      bytes: new Uint8Array(bytes).buffer,
    })
    const decoded = decodeOfflineRecord(encoded)
    if (!(decoded.value instanceof Blob)) throw new Error('Expected a restored Blob')
    expect(decoded.value.type).toBe('image/png')
    expect(decoded.value.size).toBe(bytes.length)
    expect(decodeOfflineRecord(record).value).toBe(original)
  })

  it('preserves photo and thumbnail independently, and restores logo uploads before schema validation', async () => {
    const photo = offlinePhoto()
    const photoOperation = {
      ...offlineOperation({
        kind: 'photo-upload',
        photo,
        blob: blob([1, 2], 'image/png'),
        thumbnail: blob([3, 4, 5], 'image/jpeg'),
      }),
      sequence: 1,
    }
    const encoded = await encodeOfflineOperation(photoOperation)
    const decoded = decodeOfflineOperation(encoded)
    if (decoded.change.kind !== 'photo-upload') throw new Error('Expected photo upload')
    expect(decoded.change.blob.type).toBe('image/png')
    expect(decoded.change.thumbnail.type).toBe('image/jpeg')
    expect(decoded.change.blob.size).toBe(2)
    expect(decoded.change.thumbnail.size).toBe(3)
    const logo = {
      ...offlineOperation({
        kind: 'logo-upload',
        asset: offlineAsset(),
        blob: blob([6, 7], 'image/webp'),
      }),
      sequence: 2,
    }
    const encodedLogo = await encodeOfflineOperation(logo)
    const decodedLogo = decodeOfflineOperation(encodedLogo)
    expect(decodedLogo.change).toMatchObject({ kind: 'logo-upload', blob: expect.any(Blob) })
    expect(decodeOfflineOperation(photoOperation).change).toEqual(photoOperation.change)
  })

  it('preserves metadata-only records and operations and rejects malformed encoded binary payloads', async () => {
    const record = {
      key: 'metadata',
      userId: OFFLINE_USER,
      organizationId: OFFLINE_ORG,
      value: { items: [] },
    }
    expect(await encodeOfflineRecord(record)).toEqual(record)
    const operation = {
      ...offlineOperation({ kind: 'preset-create', preset: offlinePreset() }),
      sequence: 1,
    }
    expect(await encodeOfflineOperation(operation)).toEqual(operation)
    expect(decodeOfflineOperation(operation)).toEqual(operation)
    expect(() =>
      decodeOfflineRecord({
        ...record,
        value: { format: 'lumafoil-binary-v1', type: 'image/png', bytes: 'not binary' },
      }),
    ).toThrow()
    expect(() =>
      decodeOfflineOperation({
        ...operation,
        change: {
          kind: 'photo-upload',
          blob: { format: 'lumafoil-binary-v1', type: 'image/png', bytes: new ArrayBuffer(1) },
        },
      }),
    ).toThrow()
    expect(() => decodeOfflineOperation(null)).toThrow()
  })
})
