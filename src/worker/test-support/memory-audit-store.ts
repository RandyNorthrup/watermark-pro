import { AUDIT_PAGE_SIZE } from '../../shared/constants'
import type { AuditEntry, AuditRecord, AuditStore } from '../audit'

/** In-memory audit store for Node unit tests, which have no D1 binding. */
export function createMemoryAuditStore(): AuditStore & { records: AuditRecord[] } {
  const records: AuditRecord[] = []
  return {
    records,
    append(entry: AuditEntry) {
      records.push({ ...entry, id: crypto.randomUUID(), createdAt: new Date() })
      return Promise.resolve()
    },
    listForOrganization(organizationId: string) {
      return Promise.resolve(
        records
          .filter((record) => record.organizationId === organizationId)
          .toReversed()
          .slice(0, AUDIT_PAGE_SIZE),
      )
    },
    listAll() {
      return Promise.resolve(records.toReversed().slice(0, AUDIT_PAGE_SIZE))
    },
  }
}
