import type {
  ContentMove,
  FolderCreate,
  FolderDto,
  FolderKind,
  FolderUpdate,
  FolderWriteResult,
} from '../shared/folders'

export interface FolderWriteContext {
  organizationId: string
  actorId: string
  actorName: string
  operationId: string
  fingerprint: string
}

export type FolderWriteOutcome =
  { status: 'applied'; value: FolderWriteResult } | { status: 'forbidden' | 'conflict' }

/** Every write revalidates permission, parent/content scope, and revision in its transaction. */
export interface FolderStore {
  list(organizationId: string, userId: string, kind: FolderKind): Promise<FolderDto[] | null>
  create(context: FolderWriteContext, input: FolderCreate): Promise<FolderWriteOutcome>
  update(context: FolderWriteContext, id: string, input: FolderUpdate): Promise<FolderWriteOutcome>
  delete(
    context: FolderWriteContext,
    id: string,
    expectedRevision: number,
    expectedVersionId: string,
  ): Promise<FolderWriteOutcome>
  moveContent(context: FolderWriteContext, input: ContentMove): Promise<FolderWriteOutcome>
  /** Checks an upload destination before reading/encoding its bytes; commit checks it again. */
  exists(organizationId: string, kind: FolderKind, id: string): Promise<boolean>
}
