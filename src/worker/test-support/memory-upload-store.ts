import { workspaceCapacity } from '../../shared/plans'
import type { AuditEntry, AuditStore } from '../audit'
import { apiErrors } from '../errors'
import type { PlanStore } from '../plan-store'
import type { AssetStore, OrganizationStore, PhotoStore, WatermarkStore } from '../stores'
import { UPLOAD_POLICY, type UploadReservation, type UploadStore } from '../upload-store'

interface Dependencies {
  assets: AssetStore
  photos: PhotoStore
  organizations: OrganizationStore
  audit: AuditStore
  watermarks: WatermarkStore
  plans: PlanStore
}
type Reservation = UploadReservation & { status: 'pending' | 'cleanup' | 'committed' | 'deleted' }

/** Serialized memory transactions mirror D1 admission; real D1 tests prove SQL atomicity. */
export function createMemoryUploadStore({
  assets,
  photos,
  organizations,
  audit,
  watermarks,
  plans,
}: Dependencies): UploadStore {
  const records = new Map<string, Reservation>()
  const mutex = { tail: Promise.resolve() }
  async function locked<T>(action: () => Promise<T>): Promise<T> {
    const previous = mutex.tail
    const completion = Promise.withResolvers<undefined>()
    mutex.tail = completion.promise
    await previous
    try {
      return await action()
    } finally {
      completion.resolve(undefined)
    }
  }
  const scoped = (organizationId: string) =>
    records
      .values()
      .filter((record) => record.organizationId === organizationId)
      .toArray()
  const isActive = (record: Reservation) =>
    record.status === 'pending' || record.status === 'cleanup'
  async function usage(organizationId: string) {
    const [saved, logos] = await Promise.all([
      photos.usage(organizationId),
      assets.listForOrganization(organizationId, 'logo'),
    ])
    return {
      count: saved.count,
      bytes:
        saved.bytes +
        logos.reduce((sum, logo) => sum + logo.size, 0) +
        scoped(organizationId)
          .filter((record) => isActive(record))
          .reduce((sum, record) => sum + record.bytes, 0),
    }
  }
  function cleanupRecord(
    organizationId: string,
    uploadId: string,
    kind: 'photo' | 'logo',
    keys: string[],
    bytes: number,
    entry: AuditEntry,
  ): Reservation {
    if (entry.actorUserId === undefined) throw new Error('Deletion requires an actor')
    return {
      id: crypto.randomUUID(),
      organizationId,
      uploadId,
      kind,
      userId: entry.actorUserId,
      fingerprint: 'deletion',
      keys,
      bytes,
      expiresAt: new Date(),
      status: 'cleanup',
    }
  }
  function retainDeletion(cleanup: Reservation) {
    if (
      scoped(cleanup.organizationId).every(
        (record) =>
          !(
            record.kind === cleanup.kind &&
            record.uploadId === cleanup.uploadId &&
            record.status === 'deleted'
          ),
      )
    ) {
      const receipt = {
        ...cleanup,
        id: crypto.randomUUID(),
        status: 'deleted' as const,
        keys: [],
        bytes: 0,
      }
      records.set(receipt.id, receipt)
    }
    records.set(cleanup.id, cleanup)
  }
  return {
    // Real-auth Node tests spy this persistence boundary; actual D1/R2 tests certify set-based erasure.
    stagePersonalDeletion: () => Promise.resolve(),
    hasContent(organizationId) {
      return locked(async () => {
        const [current, logos, marks] = await Promise.all([
          usage(organizationId),
          assets.listForOrganization(organizationId, 'logo'),
          watermarks.listForOrganization(organizationId),
        ])
        return (
          current.count > 0 ||
          current.bytes > 0 ||
          logos.length > 0 ||
          marks.length > 0 ||
          scoped(organizationId).some((record) => isActive(record))
        )
      })
    },
    reserve(input) {
      return locked(async () => {
        const pending = scoped(input.organizationId).find(
          (record) =>
            record.kind === input.kind &&
            record.uploadId === input.uploadId &&
            record.status === 'pending',
        )
        if (pending !== undefined)
          return pending.userId === input.userId && pending.fingerprint === input.fingerprint
            ? 'pending'
            : 'conflict'
        const existing =
          input.kind === 'photo'
            ? await photos.find(input.organizationId, input.uploadId)
            : await assets.find(input.organizationId, input.uploadId)
        if (existing !== null) return 'existing'
        if (
          scoped(input.organizationId).some(
            (record) =>
              record.kind === input.kind &&
              record.uploadId === input.uploadId &&
              (record.status === 'committed' || record.status === 'deleted'),
          )
        )
          return 'deleted'
        const [current, logos] = await Promise.all([
          usage(input.organizationId),
          assets.listForOrganization(input.organizationId, 'logo'),
        ])
        const count =
          (input.kind === 'photo' ? current.count : logos.length) +
          scoped(input.organizationId).filter(
            (record) => record.kind === input.kind && isActive(record),
          ).length
        const capacity = workspaceCapacity(await plans.get(input.organizationId))
        const maximum = input.kind === 'photo' ? capacity.photos : capacity.logos
        if (count >= maximum || current.bytes + input.bytes > capacity.storageBytes) return 'quota'
        records.set(input.id, { ...input, status: 'pending' })
        return 'reserved'
      })
    },
    isLeaseWritable(input) {
      // Named Node fixture models reservation identity; actual D1 tests certify the live writer predicate.
      return locked(() => {
        const stored = records.get(input.id)
        return Promise.resolve(
          stored?.status === 'pending' &&
            stored.expiresAt.getTime() > Date.now() &&
            stored.organizationId === input.organizationId &&
            stored.userId === input.userId &&
            stored.uploadId === input.uploadId &&
            stored.kind === input.kind &&
            stored.fingerprint === input.fingerprint &&
            JSON.stringify(stored.keys) === JSON.stringify(input.keys),
        )
      })
    },
    commit(input, record, entry) {
      return locked(async () => {
        const reservation = records.get(input.id)
        if (reservation?.status !== 'pending' || reservation.expiresAt.getTime() <= Date.now())
          return false
        if (
          record.value.id !== input.uploadId ||
          record.value.organizationId !== input.organizationId ||
          record.value.createdBy !== input.userId ||
          record.kind !== input.kind
        )
          throw new Error('Invalid upload reservation commit')
        const [current, logos, plan] = await Promise.all([
          usage(input.organizationId),
          assets.listForOrganization(input.organizationId, 'logo'),
          plans.get(input.organizationId),
        ])
        const capacity = workspaceCapacity(plan)
        const count =
          (input.kind === 'photo' ? current.count : logos.length) +
          scoped(input.organizationId).filter((item) => item.kind === input.kind && isActive(item))
            .length
        if (
          count > (input.kind === 'photo' ? capacity.photos : capacity.logos) ||
          current.bytes > capacity.storageBytes
        )
          throw apiErrors.quotaExceeded()
        if (record.kind === 'photo') await photos.create(record.value)
        else await assets.create(record.value)
        try {
          await audit.append(entry)
        } catch (error) {
          if (record.kind === 'photo')
            await photos.deleteMany(input.organizationId, [input.uploadId])
          else await assets.delete(input.organizationId, input.uploadId)
          throw error
        }
        reservation.status = 'committed'
        return true
      })
    },
    abandon(id) {
      return locked(() => {
        const record = records.get(id)
        if (record?.status === 'pending') record.status = 'cleanup'
        return Promise.resolve()
      })
    },
    cleanupCandidates(organizationId) {
      return locked(() => {
        for (const record of records.values())
          if (
            record.status === 'pending' &&
            (organizationId === undefined || record.organizationId === organizationId) &&
            record.expiresAt.getTime() <= Date.now()
          )
            record.status = 'cleanup'
        return Promise.resolve(
          records
            .values()
            .filter(
              (record) =>
                record.status === 'cleanup' &&
                (organizationId === undefined || record.organizationId === organizationId),
            )
            .take(UPLOAD_POLICY.cleanupBatch)
            .toArray(),
        )
      })
    },
    release(id) {
      return locked(() => {
        if (records.get(id)?.status === 'cleanup') records.delete(id)
        return Promise.resolve()
      })
    },
    deletePhotos(organizationId, ids, entry) {
      return locked(async () => {
        const rows = await photos.findMany(organizationId, ids)
        if (rows.length === 0) return 0
        await audit.append(entry)
        const deleted = await photos.deleteMany(
          organizationId,
          rows.map((row) => row.id),
        )
        for (const record of scoped(organizationId))
          if (
            record.kind === 'photo' &&
            ids.includes(record.uploadId) &&
            record.status === 'committed'
          )
            record.status = 'deleted'
        for (const row of rows) {
          const cleanup = cleanupRecord(
            organizationId,
            row.id,
            'photo',
            [row.key, row.thumbnailKey],
            row.size + (row.thumbnailSize ?? 0),
            entry,
          )
          retainDeletion(cleanup)
        }
        return deleted
      })
    },
    deleteLogo(organizationId, id, entry) {
      return locked(async () => {
        const row = await assets.find(organizationId, id)
        if (row === null) return false
        if ((await watermarks.countReferencingAsset(organizationId, id)) > 0) return false
        await audit.append(entry)
        const isDeleted = await assets.delete(organizationId, id)
        for (const record of scoped(organizationId))
          if (record.kind === 'logo' && record.uploadId === id && record.status === 'committed')
            record.status = 'deleted'
        const cleanup = cleanupRecord(organizationId, id, 'logo', [row.key], row.size, entry)
        retainDeletion(cleanup)
        return isDeleted
      })
    },
    usage(organizationId) {
      return locked(async () => await usage(organizationId))
    },
    usageByOrganization() {
      return locked(async () => {
        const rows = await organizations.listSummaries()
        const usages = await Promise.all(
          rows.map(async (row) => [row.id, await usage(row.id)] as const),
        )
        return new Map(usages)
      })
    },
  }
}
