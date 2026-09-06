import { HEX_RADIX } from '../shared/constants'

export interface AuditEntry {
  organizationId?: string
  actorUserId?: string
  /** Snapshot of the actor's display name at the time of the action. */
  actorName?: string
  action: string
  targetType: string
  targetId?: string
  ipHash?: string
  userAgent?: string
  metadata?: Record<string, unknown>
}

export interface AuditRecord extends AuditEntry {
  id: string
  createdAt: Date
}

/**
 * Append-only audit trail. Failures propagate: an action whose audit row
 * cannot be written is reported as failed rather than silently unrecorded.
 */
export interface AuditStore {
  append(entry: AuditEntry): Promise<void>
  /** Newest first, capped at `AUDIT_PAGE_SIZE`. */
  listForOrganization(organizationId: string): Promise<AuditRecord[]>
  /** Every organization plus platform-level entries; newest first, same cap. Platform admins only. */
  listAll(): Promise<AuditRecord[]>
}

/**
 * One-way hash of a client address so audit rows can be correlated without
 * storing the address itself.
 */
export async function hashIp(ip: string, secret: string): Promise<string> {
  const data = new TextEncoder().encode(`${secret}:${ip}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(HEX_RADIX).padStart(2, '0'))
    .join('')
}
