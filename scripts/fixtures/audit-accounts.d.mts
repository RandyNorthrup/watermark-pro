import type { APIRequestContext } from '@playwright/test'

/** Real isolated-gate identity prepared through email verification and password authentication. */
export interface AuditAccount {
  context: APIRequestContext
  person: { name: string; email: string; password: string }
  organizationId: string
}

/** Creates a real standard account and its private workspace in the loopback console-mailbox gate. */
export function createAuditAccount(origin: string, name?: string): Promise<AuditAccount>
