import { env } from 'cloudflare:workers'

import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { member, organization, uploadReservation, user } from './db/schema'
import { getServices } from './services'
import { cleanupUploads, persistUpload } from './upload-lifecycle'
import { UPLOAD_POLICY, type UploadRecord, type UploadReservation } from './upload-store'

const services = getServices(env)
let organizationId: string
let userId: string

beforeEach(async () => {
  vi.restoreAllMocks()
  userId = crypto.randomUUID()
  organizationId = crypto.randomUUID()
  await services.db.insert(user).values({
    id: userId,
    name: 'Producer boundary fixture',
    email: `${userId}@example.test`,
    emailVerified: true,
    membershipCohort: 'private',
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  await services.db.insert(organization).values({
    id: organizationId,
    name: 'Producer boundary workspace',
    slug: organizationId,
    creationOwnerId: userId,
    createdAt: new Date(),
  })
  await services.db.insert(member).values({
    id: crypto.randomUUID(),
    organizationId,
    userId,
    role: 'owner',
    createdAt: new Date(),
  })
})

function producer() {
  const leaseId = crypto.randomUUID()
  const id = crypto.randomUUID()
  const key = `org/${organizationId}/logos/${id}/${leaseId}/named-boundary-payload`
  // Opaque bytes exercise the storage protocol directly, not image-format validation.
  const bytes = new Uint8Array([73, 42, 99]).buffer
  const reservation: UploadReservation = {
    id: leaseId,
    organizationId,
    userId,
    uploadId: id,
    kind: 'logo',
    fingerprint: 'named-boundary-fingerprint',
    keys: [key],
    bytes: bytes.byteLength,
    expiresAt: new Date(Date.now() + UPLOAD_POLICY.leaseMs),
  }
  const record: UploadRecord = {
    kind: 'logo',
    value: {
      id,
      organizationId,
      createdBy: userId,
      kind: 'logo',
      name: 'Named opaque boundary',
      key,
      contentType: 'application/octet-stream',
      size: bytes.byteLength,
      width: 1,
      height: 1,
    },
  }
  return { key, bytes, reservation, record }
}

function uploadProducer(item: ReturnType<typeof producer>) {
  return persistUpload(
    services,
    item.reservation,
    item.record,
    {
      organizationId,
      actorUserId: userId,
      action: 'asset.uploaded',
      targetType: 'asset',
      targetId: item.record.value.id,
    },
    [{ key: item.key, bytes: item.bytes, contentType: item.record.value.contentType }],
  )
}

async function outcome(promise: Promise<unknown>): Promise<unknown> {
  try {
    return await promise
  } catch (error) {
    return error
  }
}

describe('actual D1/R2 producer fence', () => {
  it('does not overwrite an existing payload during initialization and rejects payload after marker deletion', async () => {
    const item = producer()
    const etag = await services.objects.preparePut(item.key)
    await services.objects.put(item.key, item.bytes, item.record.value.contentType, etag)
    await expect(services.objects.preparePut(item.key)).rejects.toMatchObject({ status: 503 })
    const saved = await env.BUCKET.get(item.key)
    expect(await saved?.arrayBuffer()).toEqual(item.bytes)
    await services.objects.delete(item.key)
    await expect(
      services.objects.put(item.key, item.bytes, item.record.value.contentType, etag),
    ).rejects.toMatchObject({ status: 503 })
    expect(await env.BUCKET.get(item.key)).toBeNull()
  })
  it('leaves no payload when an empty initializer resumes after cleanup released the lease', async () => {
    const item = producer()
    const reached = Promise.withResolvers<undefined>(),
      resume = Promise.withResolvers<undefined>()
    const prepare = services.objects.preparePut.bind(services.objects)
    vi.spyOn(services.objects, 'preparePut').mockImplementation(async (key) => {
      reached.resolve(undefined)
      await resume.promise
      return await prepare(key)
    })
    const put = vi.spyOn(services.objects, 'put')
    const saved = outcome(uploadProducer(item))
    await reached.promise
    await services.db
      .update(uploadReservation)
      .set({ expiresAt: new Date(0) })
      .where(eq(uploadReservation.id, item.reservation.id))
    await cleanupUploads(services, organizationId)
    resume.resolve(undefined)
    expect(await saved).toMatchObject({ status: 503 })
    expect(put).not.toHaveBeenCalled()
    const marker = await env.BUCKET.get(item.key)
    expect(marker?.size).toBe(0)
    expect(await marker?.arrayBuffer()).toEqual(new Uint8Array().buffer)
    expect(await services.uploads.isLeaseWritable(item.reservation)).toBe(false)
    // Even a crash before the failed D1 check could leave only this empty marker, not personal payload.
    await env.BUCKET.delete(item.key)
  })
  it('rechecks a live ban after marker creation and never begins the payload write', async () => {
    const item = producer()
    const prepare = services.objects.preparePut.bind(services.objects)
    vi.spyOn(services.objects, 'preparePut').mockImplementation(async (key) => {
      const etag = await prepare(key)
      await services.db.update(user).set({ banned: true }).where(eq(user.id, userId))
      return etag
    })
    const put = vi.spyOn(services.objects, 'put')
    await expect(uploadProducer(item)).rejects.toMatchObject({ status: 503 })
    expect(put).not.toHaveBeenCalled()
    expect(await env.BUCKET.get(item.key)).toBeNull()
  })
  it('retains only an empty marker and durable recovery when interruption prevents the pre-payload check and abandonment', async () => {
    const item = producer()
    const check = vi
      .spyOn(services.uploads, 'isLeaseWritable')
      .mockRejectedValue(new Error('Named producer interruption'))
    const abandon = vi
      .spyOn(services.uploads, 'abandon')
      .mockRejectedValue(new Error('Named recovery outage'))
    const warning = vi.spyOn(console, 'warn').mockImplementation(vi.fn())
    const put = vi.spyOn(services.objects, 'put')
    await expect(uploadProducer(item)).rejects.toMatchObject({ status: 503 })
    expect(put).not.toHaveBeenCalled()
    const marker = await env.BUCKET.get(item.key)
    expect(marker?.size).toBe(0)
    expect(
      await services.db.query.uploadReservation.findFirst({
        where: eq(uploadReservation.id, item.reservation.id),
      }),
    ).toMatchObject({ status: 'pending', keys: [item.key] })
    expect(warning).toHaveBeenCalledWith('Upload recovery deferred to scheduled cleanup')
    check.mockRestore()
    abandon.mockRestore()
    await services.db
      .update(uploadReservation)
      .set({ expiresAt: new Date(0) })
      .where(eq(uploadReservation.id, item.reservation.id))
    expect(await cleanupUploads(services, organizationId)).toBe(0)
    expect(await env.BUCKET.get(item.key)).toBeNull()
    expect(
      await services.db.query.uploadReservation.findFirst({
        where: eq(uploadReservation.id, item.reservation.id),
      }),
    ).toBeUndefined()
  })
  it.each(['owner', 'admin', 'editor', 'viewer', 'non-member'] as const)(
    'checks current %s authority at reservation and pre-payload boundaries',
    async (role) => {
      const item = producer()
      if (role === 'non-member')
        await services.db.delete(member).where(eq(member.organizationId, organizationId))
      else
        await services.db
          .update(member)
          .set({ role })
          .where(eq(member.organizationId, organizationId))
      const canWrite = ['owner', 'admin', 'editor'].includes(role)
      if (canWrite) {
        expect(await services.uploads.reserve(item.reservation)).toBe('reserved')
        expect(await services.uploads.isLeaseWritable(item.reservation)).toBe(true)
        expect(
          await services.uploads.isLeaseWritable({
            ...item.reservation,
            keys: ['org/foreign/payload'],
          }),
        ).toBe(false)
        await services.db.update(user).set({ banned: true }).where(eq(user.id, userId))
      } else {
        await expect(services.uploads.reserve(item.reservation)).rejects.toMatchObject({
          status: 403,
        })
      }
      expect(await services.uploads.isLeaseWritable(item.reservation)).toBe(false)
      expect(await env.BUCKET.get(item.key)).toBeNull()
    },
  )
  it('does not retain payload when cleanup races a conditional put whose fixed-length stream already started', async () => {
    const item = producer()
    const etag = await services.objects.preparePut(item.key)
    const stream = new FixedLengthStream(item.bytes.byteLength)
    const writer = stream.writable.getWriter()
    const put = outcome(
      env.BUCKET.put(item.key, stream.readable, { onlyIf: { etagMatches: etag } }),
    )
    const bytes = new Uint8Array(item.bytes)
    await writer.write(bytes.slice(0, 1))
    // The started put has consumed its first byte; deletion must complete while its remaining bytes stay withheld.
    await env.BUCKET.delete(item.key)
    async function finishBody() {
      await writer.write(bytes.slice(1))
      await writer.close()
    }
    const flushed = outcome(finishBody())
    const result = await put
    if (result === null) await outcome(writer.abort())
    const flushResult = await flushed
    expect(result).toBeNull()
    if (flushResult !== undefined) expect(flushResult).toBeInstanceOf(Error)
    expect(await env.BUCKET.get(item.key)).toBeNull()
  })
  it('cannot recreate payload after expired cleanup deleted the key and released its recovery pointer', async () => {
    const item = producer()
    const reached = Promise.withResolvers<undefined>()
    const resume = Promise.withResolvers<undefined>()
    const put = services.objects.put.bind(services.objects)
    vi.spyOn(services.objects, 'put').mockImplementation(async (...args) => {
      reached.resolve(undefined)
      await resume.promise
      await put(...args)
    })
    const saved = outcome(uploadProducer(item))
    await reached.promise
    await services.db
      .update(uploadReservation)
      .set({ expiresAt: new Date(0) })
      .where(eq(uploadReservation.id, item.reservation.id))
    expect(await cleanupUploads(services, organizationId)).toBe(0)
    expect(
      await services.db.query.uploadReservation.findFirst({
        where: eq(uploadReservation.id, item.reservation.id),
      }),
    ).toBeUndefined()
    expect(await services.objects.get(item.key)).toBeNull()
    resume.resolve(undefined)
    expect(await saved).toMatchObject({ status: 503 })
    expect(await services.assets.find(organizationId, item.record.value.id)).toBeNull()
    expect(await services.objects.get(item.key)).toBeNull()
  })
})
