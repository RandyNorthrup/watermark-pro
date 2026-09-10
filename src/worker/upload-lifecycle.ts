import type { AuditEntry } from './audit'
import { apiErrors } from './errors'
import type { Services } from './services'
import type { UploadRecord, UploadReservation } from './upload-store'

type UploadServices = Pick<Services, 'uploads' | 'objects'>
export interface UploadPart {
  key: string
  bytes: ArrayBuffer
  contentType: string
}

/** Only durable cleanup records may delete objects; a lost commit acknowledgment cannot erase a saved file. */
export async function cleanupUploads(
  services: UploadServices,
  organizationId?: string,
): Promise<number> {
  const candidates = await services.uploads.cleanupCandidates(organizationId)
  let pending = 0
  for (const candidate of candidates) {
    const deletions = await Promise.allSettled(
      candidate.keys.map(async (key) => await services.objects.delete(key)),
    )
    if (deletions.some((result) => result.status === 'rejected')) {
      pending++
      continue
    }
    try {
      await services.uploads.release(candidate.id)
    } catch {
      pending++
    }
  }
  if (pending > 0) console.warn('Storage cleanup remains pending', { count: pending })
  return pending
}

/** Reserves quota before writes; metadata, audit and receipt commit together after every R2 write settles. */
export async function persistUpload(
  services: UploadServices,
  reservation: UploadReservation,
  record: UploadRecord,
  entry: AuditEntry,
  parts: UploadPart[],
): Promise<'created' | 'existing'> {
  await cleanupUploads(services, reservation.organizationId)
  const admission = await services.uploads.reserve(reservation)
  switch (admission) {
    case 'quota': {
      throw apiErrors.quotaExceeded()
    }
    case 'conflict':
    case 'deleted': {
      throw apiErrors.conflict()
    }
    case 'pending': {
      throw apiErrors.retryLater()
    }
    case 'existing': {
      return 'existing'
    }
    case 'reserved': {
      break
    }
  }
  try {
    const writes = await Promise.allSettled(
      parts.map(async (part) => await services.objects.put(part.key, part.bytes, part.contentType)),
    )
    if (writes.some((result) => result.status === 'rejected')) throw apiErrors.retryLater()
    if (!(await services.uploads.commit(reservation, record, entry))) throw apiErrors.retryLater()
    return 'created'
  } catch (error) {
    try {
      // A committed receipt cannot be abandoned. If D1 committed but its reply
      // was lost, this does nothing and the committed R2 objects remain intact.
      await services.uploads.abandon(reservation.id)
      await cleanupUploads(services, reservation.organizationId)
    } catch {
      console.warn('Upload recovery deferred to scheduled cleanup')
    }
    throw error
  }
}
