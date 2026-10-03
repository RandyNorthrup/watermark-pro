import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AuditEntry } from './audit'
import { joinAsMember, signUpOwner, TestClient } from './test-support/client'
import { LOGO_PNG } from './test-support/image-fixtures'
import { createTestHarness } from './test-support/test-app'
import { cleanupUploads, persistUpload } from './upload-lifecycle'
import { UPLOAD_POLICY, type UploadRecord, type UploadReservation } from './upload-store'
import { MAX_STORAGE_BYTES_PER_ORGANIZATION } from '../shared/constants'
import { PRIVATE_PLAN_CAPACITY, PUBLIC_PLANS } from '../shared/plans'

afterEach(() => {
  vi.restoreAllMocks()
})

function fixture(kind: 'photo' | 'logo' = 'photo') {
  const harness = createTestHarness()
  const organizationId = 'fixture-workspace'
  harness.plans.seed({
    organizationId,
    kind: 'shared',
    basePlan: 'private',
    baseMemberLimit: PRIVATE_PLAN_CAPACITY.sharedMembers,
    retainedMemberLimit: 1,
    paidPlan: null,
    paidThrough: null,
    paidAccessSuspended: false,
    revision: 0,
  })
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
  it.each(['owner', 'admin', 'editor', 'viewer', 'non-member', 'anonymous'] as const)(
    'retains real-auth upload authority before object initialization for %s',
    async (role) => {
      const harness = createTestHarness()
      const { client: owner, organizationId } = await signUpOwner(
        harness,
        {
          name: 'Producer owner',
          email: 'producer-owner@example.test',
          password: 'a producer owner passphrase',
        },
        { name: 'Producer role workspace', slug: 'producer-roles' },
      )
      const guest = {
        name: 'Producer guest',
        email: 'producer-guest@example.test',
        password: 'a producer guest passphrase',
      }
      let actor = owner
      if (role === 'anonymous' || role === 'non-member') {
        actor = new TestClient(harness.app, harness.env)
        if (role === 'non-member') await actor.signUpAndVerify(harness.mailbox, guest)
      } else if (role !== 'owner')
        actor = await joinAsMember(harness, owner, organizationId, guest, role)
      const prepare = vi.spyOn(harness.objects, 'preparePut')
      const form = new FormData()
      form.append('file', new File([LOGO_PNG], 'genuine-logo.png', { type: 'image/png' }))
      form.append('name', 'Producer role logo')
      form.append('width', '64')
      form.append('height', '32')
      // Fully encoded bytes avoid Undici's lazy File producer racing an intentional early authorization refusal.
      const multipart = new Response(form)
      const body = await multipart.arrayBuffer()
      const response = await actor.request(`/api/orgs/${organizationId}/assets`, {
        method: 'POST',
        headers: multipart.headers,
        body,
      })
      const canWrite = ['owner', 'admin', 'editor'].includes(role)
      const refused = role === 'anonymous' ? 401 : 403
      expect(response.status).toBe(canWrite ? 201 : refused)
      expect(prepare).toHaveBeenCalledTimes(canWrite ? 1 : 0)
    },
  )
  it.each(['expired', 'suspended'] as const)(
    'cleans written objects when a paid grant becomes %s before commit',
    async (change) => {
      const f = fixture()
      const baseline = await f.plans.get(f.organizationId)
      const paid = {
        ...baseline,
        kind: 'personal' as const,
        basePlan: 'free' as const,
        baseMemberLimit: 1,
        paidPlan: 'pro' as const,
        paidThrough: new Date(Date.now() + UPLOAD_POLICY.leaseMs),
      }
      f.plans.seed(paid)
      f.reservation.bytes = PUBLIC_PLANS.free.storageBytes + 1
      const original = f.objects.put.bind(f.objects)
      vi.spyOn(f.objects, 'put').mockImplementation(async (...args) => {
        await original(...args)
        f.plans.seed({
          ...paid,
          ...(change === 'expired' ? { paidThrough: new Date(0) } : { paidAccessSuspended: true }),
        })
      })
      await expect(f.save()).rejects.toMatchObject({ status: 400 })
      expect(f.objects.keys()).toEqual([])
      expect(await f.services.photos.find(f.organizationId, f.reservation.uploadId)).toBeNull()
      expect(await f.services.uploads.usage(f.organizationId)).toEqual({ count: 0, bytes: 0 })
      expect(await f.services.audit.listForOrganization(f.organizationId)).toEqual([])
    },
  )
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
    vi.spyOn(f.objects, 'put').mockImplementation(async (key, bytes, contentType, etag) => {
      await original(key, bytes, contentType, etag)
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
