import type {
  CloudAttemptState,
  CloudConnectionState,
  CloudProvider,
} from '../shared/cloud-connections'

export interface CloudConnectionRecord {
  userId: string
  provider: CloudProvider
  status: CloudConnectionState
  generation: number
  clientId: string | null
  providerAccountId: string | null
  accountLabel: string | null
  accessCipher: string | null
  refreshCipher: string | null
  accessExpiresAt: Date | null
  scopes: string
  refreshLeaseId: string | null
  refreshLeaseExpiresAt: Date | null
  updatedAt: Date
}

export interface CloudAttemptRecord {
  id: string
  userId: string
  sessionId: string
  provider: CloudProvider
  stateHash: string
  verifierCipher: string
  generation: number
  status: CloudAttemptState
  expiresAt: Date
}

export type CloudCredentialUpdate = Pick<
  CloudConnectionRecord,
  | 'clientId'
  | 'providerAccountId'
  | 'accountLabel'
  | 'accessCipher'
  | 'refreshCipher'
  | 'accessExpiresAt'
  | 'scopes'
>

/** Credentials belong to accounts, never to shared workspaces or their members. */
export interface CloudStore {
  list(userId: string): Promise<CloudConnectionRecord[]>
  find(userId: string, provider: CloudProvider): Promise<CloudConnectionRecord | null>
  begin(
    attempt: Omit<CloudAttemptRecord, 'generation' | 'status'>,
    now: Date,
  ): Promise<CloudAttemptRecord>
  claim(
    stateHash: string,
    userId: string,
    sessionId: string,
    provider: CloudProvider,
    now: Date,
  ): Promise<CloudAttemptRecord | null>
  attempt(id: string, userId: string, sessionId: string): Promise<CloudAttemptRecord | null>
  complete(
    attempt: CloudAttemptRecord,
    credentials: CloudCredentialUpdate,
    now: Date,
  ): Promise<boolean>
  failAttempt(id: string, userId: string, sessionId: string): Promise<void>
  cancelAttempt(id: string, userId: string, sessionId: string, now: Date): Promise<boolean>
  leaseRefresh(
    userId: string,
    provider: CloudProvider,
    generation: number,
    leaseId: string,
    now: Date,
    until: Date,
  ): Promise<boolean>
  finishRefresh(
    userId: string,
    provider: CloudProvider,
    generation: number,
    leaseId: string,
    credentials: CloudCredentialUpdate,
    now: Date,
  ): Promise<boolean>
  releaseRefresh(
    userId: string,
    provider: CloudProvider,
    generation: number,
    leaseId: string,
    requiresReconnect: boolean,
  ): Promise<void>
  disconnect(
    userId: string,
    provider: CloudProvider,
    now: Date,
  ): Promise<CloudConnectionRecord | null>
}
