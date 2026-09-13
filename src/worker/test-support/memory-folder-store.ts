import { z } from 'zod'

import { MAX_PHOTOS_PER_ORGANIZATION } from '../../shared/constants'
import {
  FOLDER_POLICY,
  folderNameKey,
  folderWriteResultSchema,
  type FolderDto,
  type FolderKind,
  type FolderWriteResult,
} from '../../shared/folders'
import type { AuditRecord } from '../audit'
import type { FolderStore, FolderWriteContext, FolderWriteOutcome } from '../folder-store'
import type { PhotoStore, WatermarkStore } from '../stores'

interface Tables {
  user: { id?: string; emailVerified?: boolean; banned?: boolean | null }[]
  member: { organizationId: string; userId: string; role: string }[]
}
const receiptSchema = z.object({ fingerprint: z.string(), result: folderWriteResultSchema })

/** Serial transactions share real Better Auth membership rows and the existing content fixtures. */
export function createMemoryFolderStore(
  tables: Tables,
  photos: PhotoStore,
  presets: WatermarkStore,
  audit: { records: AuditRecord[] },
): FolderStore {
  const folders = new Map<string, FolderDto>()
  let pending: Promise<unknown> = Promise.resolve()
  function permitted(organizationId: string, userId: string, isWrite: boolean) {
    const user = tables.user.find((row) => row.id === userId)
    const member = tables.member.find(
      (row) => row.organizationId === organizationId && row.userId === userId,
    )
    return (
      user?.emailVerified === true &&
      user.banned !== true &&
      member !== undefined &&
      (isWrite ? ['owner', 'admin', 'editor'] : ['owner', 'admin', 'editor', 'viewer']).includes(
        member.role,
      )
    )
  }
  const inWorkspace = (org: string, id: string) => {
    const folder = folders.get(id)
    return folder?.organizationId === org ? folder : undefined
  }
  const isDestinationAvailable = (org: string, kind: FolderKind, parentId: string | null) =>
    parentId === null || inWorkspace(org, parentId)?.kind === kind
  function validTree(org: string, kind: FolderKind, parentId: string | null, ownId: string) {
    if (!isDestinationAvailable(org, kind, parentId)) return false
    let ancestor = parentId
    let depth = 1
    while (ancestor !== null) {
      if (ancestor === ownId || depth > FOLDER_POLICY.maxDepth) return false
      const parent = inWorkspace(org, ancestor)
      if (parent === undefined) return false
      ancestor = parent.parentId
      depth += 1
    }
    const descendants = [{ id: ownId, depth }]
    while (descendants.length > 0) {
      const current = descendants.pop()
      if (current === undefined || current.depth > FOLDER_POLICY.maxDepth) return false
      for (const child of folders.values())
        if (child.parentId === current.id)
          descendants.push({ id: child.id, depth: current.depth + 1 })
    }
    return true
  }
  const isSiblingUnique = (
    org: string,
    kind: FolderKind,
    parent: string | null,
    name: string,
    ownId: string,
  ) =>
    !folders
      .values()
      .some(
        (folder) =>
          folder.organizationId === org &&
          folder.kind === kind &&
          folder.parentId === parent &&
          folder.id !== ownId &&
          folderNameKey(folder.name) === folderNameKey(name),
      )
  async function withCounts(folder: FolderDto): Promise<FolderDto> {
    const [photoPage, marks] = await Promise.all([
      photos.list(folder.organizationId, { limit: MAX_PHOTOS_PER_ORGANIZATION }),
      presets.listForOrganization(folder.organizationId),
    ])
    return {
      ...folder,
      childCount: folders
        .values()
        .filter((child) => child.parentId === folder.id)
        .toArray().length,
      itemCount:
        photoPage.photos.filter((photo) => photo.folderId === folder.id).length +
        marks.filter((preset) => preset.folderId === folder.id).length,
    }
  }
  function execute(
    context: FolderWriteContext,
    targetId: string,
    action: string,
    prepare: () => Promise<{ value: FolderWriteResult; apply: () => void } | null>,
  ): Promise<FolderWriteOutcome> {
    const previous = pending
    const completion = Promise.withResolvers<undefined>()
    pending = completion.promise
    const result = (async (): Promise<FolderWriteOutcome> => {
      await previous
      try {
        if (!permitted(context.organizationId, context.actorId, true))
          return { status: 'forbidden' }
        const receipt = audit.records.find((record) => record.id === context.operationId)
        if (receipt !== undefined) {
          const parsed = receiptSchema.safeParse(receipt.metadata)
          return receipt.organizationId === context.organizationId &&
            receipt.actorUserId === context.actorId &&
            parsed.success &&
            parsed.data.fingerprint === context.fingerprint
            ? { status: 'applied', value: structuredClone(parsed.data.result) }
            : { status: 'conflict' }
        }
        const next = await prepare()
        if (!permitted(context.organizationId, context.actorId, true))
          return { status: 'forbidden' }
        if (next === null) return { status: 'conflict' }
        next.apply()
        audit.records.push({
          id: context.operationId,
          organizationId: context.organizationId,
          actorUserId: context.actorId,
          actorName: context.actorName,
          action,
          targetType: 'folder',
          targetId,
          createdAt: new Date(),
          metadata: { fingerprint: context.fingerprint, result: structuredClone(next.value) },
        })
        return { status: 'applied', value: structuredClone(next.value) }
      } finally {
        completion.resolve(undefined)
      }
    })()
    return result
  }
  return {
    async list(organizationId, userId, kind) {
      if (!permitted(organizationId, userId, false)) return null
      const selected = folders
        .values()
        .filter((folder) => folder.organizationId === organizationId && folder.kind === kind)
        .toArray()
      return await Promise.all(selected.map((folder) => withCounts(folder)))
    },
    exists: (org, kind, id) => Promise.resolve(isDestinationAvailable(org, kind, id)),
    create(context, input) {
      return execute(context, input.id, 'folder.created', () => {
        if (
          folders.has(input.id) ||
          !validTree(context.organizationId, input.kind, input.parentId, input.id) ||
          !isSiblingUnique(
            context.organizationId,
            input.kind,
            input.parentId,
            input.name,
            input.id,
          ) ||
          folders
            .values()
            .filter((folder) => folder.organizationId === context.organizationId)
            .toArray().length >= FOLDER_POLICY.maxFolders
        )
          return Promise.resolve(null)
        const now = new Date().toISOString()
        const folder: FolderDto = {
          ...input,
          organizationId: context.organizationId,
          revision: 0,
          versionId: context.operationId,
          createdBy: context.actorId,
          createdAt: now,
          updatedAt: now,
          childCount: 0,
          itemCount: 0,
        }
        return Promise.resolve({
          value: { folder, moved: [] },
          apply: () => {
            folders.set(input.id, folder)
          },
        })
      })
    },
    update(context, id, input) {
      return execute(context, id, 'folder.updated', async () => {
        const previous = inWorkspace(context.organizationId, id)
        if (
          previous?.revision !== input.expectedRevision ||
          previous.versionId !== input.expectedVersionId ||
          !validTree(context.organizationId, previous.kind, input.parentId, id) ||
          !isSiblingUnique(context.organizationId, previous.kind, input.parentId, input.name, id)
        )
          return null
        const folder = await withCounts({
          ...previous,
          name: input.name,
          parentId: input.parentId,
          revision: previous.revision + 1,
          versionId: context.operationId,
          updatedAt: new Date().toISOString(),
        })
        return {
          value: { folder, moved: [] },
          apply: () => {
            folders.set(id, folder)
          },
        }
      })
    },
    delete(context, id, expectedRevision, expectedVersionId) {
      return execute(context, id, 'folder.deleted', async () => {
        const previous = inWorkspace(context.organizationId, id)
        if (previous?.revision !== expectedRevision || previous.versionId !== expectedVersionId)
          return null
        const folder = await withCounts(previous)
        if (folder.childCount > 0 || folder.itemCount > 0) return null
        return {
          value: { folder: null, moved: [] },
          apply: () => {
            folders.delete(id)
          },
        }
      })
    },
    moveContent(context, input) {
      return execute(context, input.folderId ?? 'root', 'folder.content_moved', async () => {
        if (!isDestinationAvailable(context.organizationId, input.kind, input.folderId)) return null
        const store = input.kind === 'photo' ? photos : presets
        const records = await store.findMany(
          context.organizationId,
          input.items.map((item) => item.id),
        )
        if (
          records.length !== input.items.length ||
          records.some(
            (record) =>
              input.items.find((item) => item.id === record.id)?.expectedFolderRevision !==
                (record.folderRevision ?? 0) ||
              (input.items.find((item) => item.id === record.id)?.expectedFolderVersionId ??
                null) !== (record.folderVersionId ?? null),
          )
        )
          return null
        const moved = records.map((record) => ({
          id: record.id,
          organizationId: context.organizationId,
          kind: input.kind,
          folderId: input.folderId,
          folderRevision: (record.folderRevision ?? 0) + 1,
          folderVersionId: context.operationId,
        }))
        return {
          value: { folder: null, moved },
          apply: () => {
            for (const record of records) {
              record.folderId = input.folderId
              record.folderRevision = (record.folderRevision ?? 0) + 1
              record.folderVersionId = context.operationId
            }
          },
        }
      })
    },
  }
}
