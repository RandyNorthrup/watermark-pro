import { env } from 'cloudflare:workers'

import { eq, sql } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { AuditEntry } from './audit'
import { organization, uploadReservation, user } from './db/schema'
import { getServices } from './services'
import { cleanupUploads, persistUpload } from './upload-lifecycle'
import { UPLOAD_POLICY, type UploadRecord, type UploadReservation } from './upload-store'
import {
  MAX_LOGOS_PER_ORGANIZATION,
  MAX_PHOTOS_PER_ORGANIZATION,
  MAX_STORAGE_BYTES_PER_ORGANIZATION,
} from '../shared/constants'
import { DEFAULT_STYLE, DEFAULT_TEXT_SPEC } from '../shared/watermark'

const services = getServices(env)
const actorId = 'upload-fixture-owner'
let organizationId: string

beforeAll(async () => {
  await services.db.insert(user).values({
    id: actorId,
    name: 'Upload fixture',
    email: 'uploads@example.test',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
})
beforeEach(async () => {
  organizationId = crypto.randomUUID()
  await services.db.insert(organization).values({
    id: organizationId,
    name: 'Upload workspace',
    slug: organizationId,
    createdAt: new Date(),
  })
})

function entry(id: string): AuditEntry {
  return {
    organizationId,
    actorUserId: actorId,
    actorName: 'Upload fixture',
    action: 'photo.uploaded',
    targetType: 'photo',
    targetId: id,
  }
}
function upload(kind: 'photo' | 'logo' = 'photo', bytes = 2) {
  const id = crypto.randomUUID()
  const lease = crypto.randomUUID()
  const key = `org/${organizationId}/${kind}/${id}/${lease}`
  const keys = kind === 'photo' ? [key, `${key}-thumb`] : [key]
  const reservation: UploadReservation = {
    id: lease,
    organizationId,
    uploadId: id,
    kind,
    userId: actorId,
    fingerprint: 'test-digest',
    keys,
    bytes,
    expiresAt: new Date(Date.now() + UPLOAD_POLICY.leaseMs),
  }
  const value = {
    id,
    organizationId,
    key,
    name: 'File',
    contentType: 'image/png',
    size: kind === 'photo' ? bytes - 1 : bytes,
    width: 1,
    height: 1,
    createdBy: actorId,
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
  return {
    reservation,
    record,
    audit: entry(id),
    parts: keys.map((partKey) => ({
      key: partKey,
      bytes: new Uint8Array([1]).buffer,
      contentType: 'image/png',
    })),
  }
}
async function seedCount(kind: 'photo' | 'logo', count: number) {
  if (kind === 'photo') {
    await services.db.run(sql`
      WITH RECURSIVE slots(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM slots WHERE i < ${count})
            INSERT INTO photo (id, organization_id, name, key, thumbnail_key, content_type, size, width, height, created_at)
            SELECT ${organizationId} || '-' || i, ${organizationId}, 'Seed', 'seed', 'seed-thumb', 'image/png', 0, 1, 1, 0 FROM slots
    `)
  } else {
    await services.db.run(sql`
      WITH RECURSIVE slots(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM slots WHERE i < ${count})
            INSERT INTO asset (id, organization_id, kind, name, key, content_type, size, width, height, created_at)
            SELECT ${organizationId} || '-' || i, ${organizationId}, 'logo', 'Seed', 'seed', 'image/png', 0, 1, 1, 0 FROM slots
    `)
  }
}

describe('atomic D1 upload admission and R2 recovery', () => {
  it.each(['photo', 'logo'] as const)(
    'admits only the final available %s slot under concurrent requests',
    async (kind) => {
      await seedCount(
        kind,
        (kind === 'photo' ? MAX_PHOTOS_PER_ORGANIZATION : MAX_LOGOS_PER_ORGANIZATION) - 1,
      )
      const requests = Array.from({ length: 4 }, () => upload(kind))
      const results = await Promise.all(
        requests.map(async (item) => await services.uploads.reserve(item.reservation)),
      )
      expect(results.filter((result) => result === 'reserved')).toHaveLength(1)
      expect(results.filter((result) => result === 'quota')).toHaveLength(3)
    },
  )
  it('shares the byte budget between photos, thumbnails, logos and outstanding reservations', async () => {
    const saved = upload('photo', MAX_STORAGE_BYTES_PER_ORGANIZATION - 2)
    expect(await services.uploads.reserve(saved.reservation)).toBe('reserved')
    expect(await services.uploads.commit(saved.reservation, saved.record, saved.audit)).toBe(true)
    const photoAttempt = upload('photo')
    const logoAttempt = upload('logo')
    const results = await Promise.all([
      services.uploads.reserve(photoAttempt.reservation),
      services.uploads.reserve(logoAttempt.reservation),
    ])
    expect(results.toSorted((left, right) => left.localeCompare(right))).toEqual([
      'quota',
      'reserved',
    ])
    expect(await services.uploads.usage(organizationId)).toEqual({
      count: 1,
      bytes: MAX_STORAGE_BYTES_PER_ORGANIZATION,
    })
    const byOrganization = await services.uploads.usageByOrganization()
    expect(byOrganization.get(organizationId)?.bytes).toBe(MAX_STORAGE_BYTES_PER_ORGANIZATION)
  })
  it('fences duplicate, changed-payload and changed-account concurrent uploads', async () => {
    const item = upload()
    expect(await services.uploads.reserve(item.reservation)).toBe('reserved')
    expect(await services.uploads.reserve({ ...item.reservation, id: crypto.randomUUID() })).toBe(
      'pending',
    )
    expect(
      await services.uploads.reserve({
        ...item.reservation,
        id: crypto.randomUUID(),
        fingerprint: 'different',
      }),
    ).toBe('conflict')
    expect(
      await services.uploads.reserve({
        ...item.reservation,
        id: crypto.randomUUID(),
        userId: 'different-account',
      }),
    ).toBe('conflict')
    expect(await services.uploads.commit(item.reservation, item.record, item.audit)).toBe(true)
    expect(await services.uploads.reserve({ ...item.reservation, id: crypto.randomUUID() })).toBe(
      'existing',
    )
  })
  it('rolls back metadata when the audit insert fails, then recovers quota and files', async () => {
    const item = upload()
    await services.db.run(
      sql`CREATE TRIGGER fixture_reject_upload_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT, 'Fixture audit failure'); END`,
    )
    try {
      await expect(
        persistUpload(services, item.reservation, item.record, item.audit, item.parts),
      ).rejects.toThrow()
    } finally {
      await services.db.run(sql`DROP TRIGGER fixture_reject_upload_audit`)
    }
    expect(await services.photos.find(organizationId, item.reservation.uploadId)).toBeNull()
    expect(await services.uploads.usage(organizationId)).toEqual({ count: 0, bytes: 0 })
    for (const key of item.reservation.keys) expect(await services.objects.get(key)).toBeNull()
  })
  it('retains a committed file when D1 commits but its acknowledgment is lost', async () => {
    const item = upload()
    const faultServices = {
      ...services,
      uploads: {
        ...services.uploads,
        async commit(...args: Parameters<typeof services.uploads.commit>) {
          await services.uploads.commit(...args)
          throw new Error('Lost D1 acknowledgment')
        },
      },
    }
    await expect(
      persistUpload(faultServices, item.reservation, item.record, item.audit, item.parts),
    ).rejects.toThrow('Lost D1 acknowledgment')
    expect(await services.photos.find(organizationId, item.reservation.uploadId)).not.toBeNull()
    for (const key of item.reservation.keys) expect(await services.objects.get(key)).not.toBeNull()
    expect(await services.uploads.reserve({ ...item.reservation, id: crypto.randomUUID() })).toBe(
      'existing',
    )
    expect(await services.uploads.cleanupCandidates(organizationId)).toEqual([])
  })
  it('waits for all R2 writes before cleaning a partially failed upload; failed cleanup retains quota', async () => {
    const item = upload()
    const faultServices = {
      ...services,
      objects: {
        ...services.objects,
        async put(key: string, bytes: ArrayBuffer, contentType: string) {
          await services.objects.put(key, bytes, contentType)
          if (key === item.reservation.keys[0]) throw new Error('Lost R2 acknowledgment')
        },
        delete: () => Promise.reject(new Error('R2 temporarily unavailable')),
      },
    }
    await expect(
      persistUpload(faultServices, item.reservation, item.record, item.audit, item.parts),
    ).rejects.toThrow()
    expect(await services.photos.find(organizationId, item.reservation.uploadId)).toBeNull()
    expect(await services.uploads.usage(organizationId)).toEqual({ count: 0, bytes: 2 })
    expect(await services.uploads.cleanupCandidates(organizationId)).toHaveLength(1)
    expect(await cleanupUploads(services, organizationId)).toBe(0)
    expect(await services.uploads.usage(organizationId)).toEqual({ count: 0, bytes: 0 })
    for (const key of item.reservation.keys) expect(await services.objects.get(key)).toBeNull()
  })
  it.each(['photo', 'logo'] as const)(
    'deletes %s metadata once, holds cleanup quota, and refuses resurrection',
    async (kind) => {
      const item = upload(kind)
      await persistUpload(services, item.reservation, item.record, item.audit, item.parts)
      if (kind === 'photo') {
        expect(
          await services.uploads.deletePhotos(
            organizationId,
            [item.reservation.uploadId],
            item.audit,
          ),
        ).toBe(1)
        expect(
          await services.uploads.deletePhotos(
            organizationId,
            [item.reservation.uploadId],
            item.audit,
          ),
        ).toBe(0)
      } else {
        expect(
          await services.uploads.deleteLogo(organizationId, item.reservation.uploadId, item.audit),
        ).toBe(true)
        expect(
          await services.uploads.deleteLogo(organizationId, item.reservation.uploadId, item.audit),
        ).toBe(false)
      }
      expect(await services.uploads.usage(organizationId)).toEqual({ count: 0, bytes: 2 })
      await cleanupUploads(services, organizationId)
      expect(await services.uploads.usage(organizationId)).toEqual({ count: 0, bytes: 0 })
      expect(await services.uploads.reserve({ ...item.reservation, id: crypto.randomUUID() })).toBe(
        'deleted',
      )
    },
  )
  it('expires abandoned leases and refuses a late commit without touching another workspace', async () => {
    const item = upload()
    await services.uploads.reserve(item.reservation)
    await services.db
      .update(uploadReservation)
      .set({ expiresAt: new Date(0) })
      .where(eq(uploadReservation.id, item.reservation.id))
    expect(await services.uploads.cleanupCandidates('other-workspace')).toEqual([])
    expect(await services.uploads.cleanupCandidates(organizationId)).toHaveLength(1)
    expect(await services.uploads.commit(item.reservation, item.record, item.audit)).toBe(false)
    await cleanupUploads(services, organizationId)
    expect(await services.uploads.usage(organizationId)).toEqual({ count: 0, bytes: 0 })
  })
  it('serializes logo references against deletion and refuses cross-workspace references in D1', async () => {
    const item = upload('logo')
    await persistUpload(services, item.reservation, item.record, item.audit, item.parts)
    const mark = {
      id: crypto.randomUUID(),
      organizationId,
      name: 'Logo mark',
      createdBy: actorId,
      spec: {
        kind: 'image' as const,
        assetId: item.reservation.uploadId,
        placement: { mode: 'smart' as const },
        contrast: { mode: 'auto' as const },
        style: DEFAULT_STYLE,
      },
    }
    await services.watermarks.create(mark)
    expect(
      await services.uploads.deleteLogo(organizationId, item.reservation.uploadId, item.audit),
    ).toBe(false)
    await expect(
      services.assets.delete(organizationId, item.reservation.uploadId),
    ).rejects.toThrow()
    expect(await services.assets.find(organizationId, item.reservation.uploadId)).not.toBeNull()
    await services.watermarks.delete(organizationId, mark.id)
    const race = await Promise.allSettled([
      services.watermarks.create({ ...mark, id: crypto.randomUUID() }),
      services.uploads.deleteLogo(organizationId, item.reservation.uploadId, item.audit),
    ])
    expect(race.some((result) => result.status === 'fulfilled')).toBe(true)
    const marks = await services.watermarks.listForOrganization(organizationId)
    const logo = await services.assets.find(organizationId, item.reservation.uploadId)
    expect(marks.length === 0 || logo !== null).toBe(true)
    const foreignId = crypto.randomUUID()
    await services.db
      .insert(organization)
      .values({ id: foreignId, name: 'Foreign workspace', slug: foreignId, createdAt: new Date() })
    await expect(
      services.watermarks.create({ ...mark, id: crypto.randomUUID(), organizationId: foreignId }),
    ).rejects.toThrow()
    const textMark = await services.watermarks.create({
      id: crypto.randomUUID(),
      organizationId: foreignId,
      name: 'Text',
      spec: DEFAULT_TEXT_SPEC,
      createdBy: actorId,
    })
    await expect(
      services.watermarks.update(foreignId, textMark.id, { name: 'Foreign logo', spec: mark.spec }),
    ).rejects.toThrow()
  })
  it('blocks workspace deletion until stored content and pending cleanup are gone', async () => {
    const item = upload()
    expect(await services.uploads.hasContent(organizationId)).toBe(false)
    await services.uploads.reserve(item.reservation)
    expect(await services.uploads.hasContent(organizationId)).toBe(true)
    await expect(
      services.db.delete(organization).where(eq(organization.id, organizationId)),
    ).rejects.toThrow()
    await services.uploads.commit(item.reservation, item.record, item.audit)
    await expect(
      services.db.delete(organization).where(eq(organization.id, organizationId)),
    ).rejects.toThrow()
    await services.uploads.deletePhotos(organizationId, [item.reservation.uploadId], item.audit)
    await expect(
      services.db.delete(organization).where(eq(organization.id, organizationId)),
    ).rejects.toThrow()
    await cleanupUploads(services, organizationId)
    const mark = await services.watermarks.create({
      id: crypto.randomUUID(),
      organizationId,
      name: 'Text',
      spec: DEFAULT_TEXT_SPEC,
      createdBy: actorId,
    })
    await expect(
      services.db.delete(organization).where(eq(organization.id, organizationId)),
    ).rejects.toThrow()
    await services.watermarks.delete(organizationId, mark.id)
    expect(await services.uploads.hasContent(organizationId)).toBe(false)
    await services.db.delete(organization).where(eq(organization.id, organizationId))
    expect(
      await services.db.query.organization.findFirst({
        where: eq(organization.id, organizationId),
      }),
    ).toBeUndefined()
  })
  it.each(['photo', 'logo'] as const)(
    'preserves deletion history for legacy %s records without a receipt',
    async (kind) => {
      const item = upload(kind)
      if (item.record.kind === 'photo') {
        await services.photos.create(item.record.value)
        await services.uploads.deletePhotos(organizationId, [item.reservation.uploadId], item.audit)
      } else {
        await services.assets.create(item.record.value)
        await services.uploads.deleteLogo(organizationId, item.reservation.uploadId, item.audit)
      }
      await cleanupUploads(services, organizationId)
      expect(await services.uploads.reserve(item.reservation)).toBe('deleted')
    },
  )
})
