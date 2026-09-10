import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AuditEntry } from './audit'
import { createTestHarness } from './test-support/test-app'
import { cleanupUploads, persistUpload } from './upload-lifecycle'
import { UPLOAD_POLICY, type UploadRecord, type UploadReservation } from './upload-store'
import { MAX_STORAGE_BYTES_PER_ORGANIZATION } from '../shared/constants'

afterEach(() => {
  vi.restoreAllMocks()
})

function fixture(kind: 'photo' | 'logo' = 'photo') {
  const harness = createTestHarness()
  const organizationId = 'fixture-workspace'
  const id = crypto.randomUUID()
  const key = `org/${organizationId}/${id}`
  const keys = kind === 'photo' ? [key, `${key}-thumb`] : [key]
  const bytes = keys.length
  const reservation: UploadReservation = {
    id: crypto.randomUUID(),
    organizationId,
    uploadId: id,
    kind,
    userId: 'fixture-user',
    fingerprint: 'fixture-digest',
    keys,
    bytes,
    expiresAt: new Date(Date.now() + UPLOAD_POLICY.leaseMs),
  }
  const value = {
    id,
    organizationId,
    key,
    name: 'Photo',
    contentType: 'image/png',
    size: 1,
    width: 1,
    height: 1,
    createdBy: 'fixture-user',
  }
  const record: UploadRecord =
    kind === 'photo'
      ? {
          kind,
          value: {
            ...value,
            thumbnailKey: `${key}-thumb`,
            thumbnailSize: 1,
            presetId: null,
            presetName: null,
          },
        }
      : { kind, value: { ...value, kind: 'logo' } }
  const audit: AuditEntry = {
    organizationId,
    actorUserId: 'fixture-user',
    actorName: 'Fixture',
    action: 'photo.uploaded',
    targetType: 'photo',
    targetId: id,
  }
  const parts = keys.map((partKey) => ({
    key: partKey,
    bytes: new Uint8Array([1]).buffer,
    contentType: 'image/png',
  }))
  const save = () => persistUpload(harness.services, reservation, record, audit, parts)
  return { ...harness, reservation, record, audit, parts, save, organizationId }
}

describe('upload lifecycle failures and recovery', () => {
  it.each(['photo', 'logo'] as const)(
    'saves %s once and preserves files on replay',
    async (kind) => {
      const f = fixture(kind)
      expect(await f.save()).toBe('created')
      expect(await f.save()).toBe('existing')
      expect(f.objects.keys()).toEqual(f.reservation.keys)
      expect(await f.services.uploads.usage(f.organizationId)).toEqual({
        count: kind === 'photo' ? 1 : 0,
        bytes: f.reservation.bytes,
      })
      expect(await f.services.uploads.hasContent(f.organizationId)).toBe(true)
    },
  )
  it('rejects full quota before any object write', async () => {
    const f = fixture()
    f.reservation.bytes = MAX_STORAGE_BYTES_PER_ORGANIZATION + 1
    await expect(f.save()).rejects.toMatchObject({ status: 400 })
    expect(f.objects.keys()).toEqual([])
  })
  it('retries the same pending operation but rejects a conflicting one', async () => {
    const f = fixture()
    await f.services.uploads.reserve(f.reservation)
    await expect(f.save()).rejects.toMatchObject({ status: 503 })
    f.reservation.fingerprint = 'different-payload'
    await expect(f.save()).rejects.toMatchObject({ status: 409 })
    expect(f.objects.keys()).toEqual([])
  })
  it.each(['photo', 'logo'] as const)(
    'preserves a tombstone after deleting a %s, refusing offline resurrection',
    async (kind) => {
      const f = fixture(kind)
      await f.save()
      if (kind === 'photo')
        await f.services.uploads.deletePhotos(f.organizationId, [f.reservation.uploadId], f.audit)
      else await f.services.uploads.deleteLogo(f.organizationId, f.reservation.uploadId, f.audit)
      await cleanupUploads(f.services, f.organizationId)
      await expect(f.save()).rejects.toMatchObject({ status: 409 })
      expect(f.objects.keys()).toEqual([])
      expect(await f.services.uploads.hasContent(f.organizationId)).toBe(false)
    },
  )
  it('waits for both writes to settle and cleans objects even when R2 lost one acknowledgment', async () => {
    const f = fixture()
    const original = f.objects.put.bind(f.objects)
    vi.spyOn(f.objects, 'put').mockImplementation(async (key, bytes, contentType) => {
      await original(key, bytes, contentType)
      if (key === f.reservation.keys[0]) throw new Error('Lost acknowledgment')
    })
    await expect(f.save()).rejects.toMatchObject({ status: 503 })
    expect(f.objects.keys()).toEqual([])
    expect(await f.services.uploads.usage(f.organizationId)).toEqual({ count: 0, bytes: 0 })
  })
  it('retains recovery and quota through failed physical deletion or failed release', async () => {
    const f = fixture()
    await f.services.uploads.reserve(f.reservation)
    await f.services.uploads.abandon(f.reservation.id)
    const deletion = vi
      .spyOn(f.objects, 'delete')
      .mockRejectedValueOnce(new Error('R2 unavailable'))
    const warning = vi.spyOn(console, 'warn').mockImplementation(vi.fn())
    expect(await cleanupUploads(f.services, f.organizationId)).toBe(1)
    expect(await f.services.uploads.usage(f.organizationId)).toEqual({ count: 0, bytes: 2 })
    deletion.mockRestore()
    const release = vi
      .spyOn(f.services.uploads, 'release')
      .mockRejectedValueOnce(new Error('D1 unavailable'))
    expect(await cleanupUploads(f.services, f.organizationId)).toBe(1)
    expect(await cleanupUploads(f.services, f.organizationId)).toBe(0)
    expect(await f.services.uploads.usage(f.organizationId)).toEqual({ count: 0, bytes: 0 })
    expect(warning).toHaveBeenCalledWith('Storage cleanup remains pending', { count: 1 })
    release.mockRestore()
  })
  it('preserves committed files when the D1 reply is lost', async () => {
    const f = fixture()
    const original = f.services.uploads.commit.bind(f.services.uploads)
    vi.spyOn(f.services.uploads, 'commit').mockImplementation(async (...args) => {
      await original(...args)
      throw new Error('Commit response lost')
    })
    await expect(f.save()).rejects.toThrow('Commit response lost')
    expect(f.objects.keys()).toEqual(f.reservation.keys)
    expect(await f.services.photos.find(f.organizationId, f.reservation.uploadId)).not.toBeNull()
    expect(await f.services.uploads.cleanupCandidates(f.organizationId)).toEqual([])
  })
  it('cleans an expired commit and leaves a durable lease when recovery itself is unavailable', async () => {
    const f = fixture()
    vi.spyOn(f.services.uploads, 'commit').mockResolvedValueOnce(false)
    const abandon = vi
      .spyOn(f.services.uploads, 'abandon')
      .mockRejectedValueOnce(new Error('D1 unavailable'))
    const warning = vi.spyOn(console, 'warn').mockImplementation(vi.fn())
    await expect(f.save()).rejects.toMatchObject({ status: 503 })
    expect(warning).toHaveBeenCalledWith('Upload recovery deferred to scheduled cleanup')
    expect(await f.services.uploads.usage(f.organizationId)).toEqual({ count: 0, bytes: 2 })
    abandon.mockRestore()
    await f.services.uploads.abandon(f.reservation.id)
    await cleanupUploads(f.services)
    expect(f.objects.keys()).toEqual([])
  })
})
