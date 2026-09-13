import { fakeAuth } from './fake-auth-module'
import type { FakeLibraryState } from './fake-library-api'
import { ACCOUNT_ID_HEADER } from '../../shared/account-identity'
import {
  contentMoveSchema,
  folderCreateSchema,
  folderDeleteSchema,
  folderNameKey,
  folderUpdateSchema,
  type FolderDto,
  type FolderWriteResult,
} from '../../shared/folders'
import { SYNC_OPERATION_HEADER } from '../../shared/sync'

/** UI-only transport model; real authorization and atomic conflict behavior have D1 tests. */
export function handleFolders(
  state: FakeLibraryState,
  url: string,
  init: RequestInit,
): Response | null {
  const parsedUrl = new URL(url, 'http://localhost')
  const match = /^\/api\/orgs\/([^/]+)\/folders(?:\/([^/]+))?$/.exec(parsedUrl.pathname)
  if (match === null) return null
  const orgId = match[1] ?? ''
  const headers = new Headers(init.headers)
  const actor = headers.get(ACCOUNT_ID_HEADER)
  const membership = fakeAuth()
    .state.organizations.find((org) => org.id === orgId)
    ?.members.find((member) => member.userId === actor)
  if (membership === undefined) return Response.json({ error: 'forbidden' }, { status: 403 })
  const method = init.method ?? 'GET'
  const scoped = state.folders.filter((folder) => folder.organizationId === orgId)
  function counts(folder: FolderDto) {
    return {
      ...folder,
      childCount: scoped.filter((child) => child.parentId === folder.id).length,
      itemCount:
        state.watermarks.filter(
          (item) => item.organizationId === orgId && item.folderId === folder.id,
        ).length +
        state.gallery.photos.filter(
          (item) => item.organizationId === orgId && item.folderId === folder.id,
        ).length,
    }
  }
  if (method === 'GET')
    return Response.json({
      folders: scoped
        .filter((folder) => folder.kind === parsedUrl.searchParams.get('kind'))
        .map((folder) => counts(folder)),
    })
  if (!['owner', 'admin', 'editor'].includes(membership.role))
    return Response.json({ error: 'forbidden' }, { status: 403 })
  const operation = headers.get(SYNC_OPERATION_HEADER) ?? crypto.randomUUID()
  const raw: unknown = JSON.parse(typeof init.body === 'string' ? init.body : '{}')
  const bodyKey = JSON.stringify([orgId, actor, method, parsedUrl.pathname, raw])
  const prior = state.folderReceipts.get(operation)
  if (prior !== undefined)
    return prior.fingerprint === bodyKey
      ? Response.json(prior.value)
      : Response.json({ error: 'conflict' }, { status: 409 })
  const fail = () => Response.json({ error: 'conflict' }, { status: 409 })
  let value: FolderWriteResult
  if (match[2] === 'move-content') {
    const body = contentMoveSchema.parse(raw)
    if (
      body.folderId !== null &&
      scoped.every((folder) => !(folder.id === body.folderId && folder.kind === body.kind))
    )
      return fail()
    const collection = body.kind === 'photo' ? state.gallery.photos : state.watermarks
    const items = collection.filter(
      (item) =>
        item.organizationId === orgId &&
        body.items.some(
          (wanted) =>
            wanted.id === item.id &&
            wanted.expectedFolderRevision === item.folderRevision &&
            wanted.expectedFolderVersionId === item.folderVersionId,
        ),
    )
    if (items.length !== body.items.length) return fail()
    for (const item of items) {
      item.folderId = body.folderId
      item.folderRevision += 1
      item.folderVersionId = operation
    }
    value = {
      folder: null,
      moved: items.map((item) => ({
        id: item.id,
        organizationId: orgId,
        kind: body.kind,
        folderId: item.folderId,
        folderRevision: item.folderRevision,
        folderVersionId: operation,
      })),
    }
  } else if (method === 'POST') {
    const body = folderCreateSchema.parse(raw)
    if (
      (body.parentId !== null &&
        scoped.every((folder) => !(folder.id === body.parentId && folder.kind === body.kind))) ||
      scoped.some(
        (folder) =>
          folder.kind === body.kind &&
          folder.parentId === body.parentId &&
          folderNameKey(folder.name) === folderNameKey(body.name),
      )
    )
      return fail()
    const now = new Date().toISOString()
    const folder: FolderDto = {
      ...body,
      organizationId: orgId,
      createdBy: actor,
      createdAt: now,
      updatedAt: now,
      revision: 0,
      versionId: operation,
      childCount: 0,
      itemCount: 0,
    }
    state.folders.push(folder)
    value = { folder, moved: [] }
  } else {
    const folder = scoped.find((candidate) => candidate.id === match[2])
    if (folder === undefined) return fail()
    const body = method === 'DELETE' ? folderDeleteSchema.parse(raw) : folderUpdateSchema.parse(raw)
    if (body.expectedRevision !== folder.revision || body.expectedVersionId !== folder.versionId)
      return fail()
    if (method === 'DELETE') {
      const current = counts(folder)
      if (current.childCount > 0 || current.itemCount > 0) return fail()
      state.folders = state.folders.filter((candidate) => candidate.id !== folder.id)
      value = { folder: null, moved: [] }
    } else {
      const update = folderUpdateSchema.parse(raw)
      folder.name = update.name
      folder.parentId = update.parentId
      folder.revision += 1
      folder.versionId = operation
      value = { folder: counts(folder), moved: [] }
    }
  }
  state.folderReceipts.set(operation, { fingerprint: bodyKey, value: structuredClone(value) })
  return Response.json(value)
}
