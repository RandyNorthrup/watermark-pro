import { fetchJson } from './api'
import type { OfflineChange } from './offline-model'
import { folderWriteResultSchema } from '../../shared/folders'
import { SYNC_OPERATION_HEADER } from '../../shared/sync'

type FolderChange = Extract<
  OfflineChange,
  { kind: 'folder-create' | 'folder-update' | 'folder-delete' | 'photo-move' | 'preset-move' }
>

/** Keep the original expected revisions on retry; acknowledgments update only local display metadata. */
export async function replayFolderChange(
  operation: { id: string; organizationId: string; change: FolderChange },
  assertCurrent: () => void,
): Promise<FolderChange> {
  const { change, organizationId } = operation
  const root = `/api/orgs/${organizationId}/folders`
  const headers = { 'content-type': 'application/json', [SYNC_OPERATION_HEADER]: operation.id }
  if (change.kind === 'photo-move' || change.kind === 'preset-move') {
    const kind = change.kind === 'photo-move' ? 'photo' : 'preset'
    const items = change.kind === 'photo-move' ? change.photos : change.presets
    const result = await fetchJson(`${root}/move-content`, folderWriteResultSchema, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        kind,
        folderId: change.folderId,
        items: items.map((item) => ({
          id: item.id,
          expectedFolderRevision: item.folderRevision,
          expectedFolderVersionId: item.folderVersionId,
        })),
      }),
    })
    assertCurrent()
    const expected = new Map(items.map((item) => [item.id, item]))
    if (
      result.moved.length !== expected.size ||
      new Set(result.moved.map((item) => item.id)).size !== expected.size ||
      result.moved.some((item) => {
        const source = expected.get(item.id)
        return (
          source === undefined ||
          item.organizationId !== organizationId ||
          item.kind !== kind ||
          item.folderId !== change.folderId ||
          item.folderRevision !== source.folderRevision + 1 ||
          item.folderVersionId !== operation.id
        )
      })
    )
      throw new Error('The server acknowledged a different move. Local changes were retained.')
    return { ...change, placements: result.moved }
  }
  const isCreate = change.kind === 'folder-create'
  let body: unknown
  if (isCreate)
    body = {
      id: change.folder.id,
      kind: change.folder.kind,
      name: change.folder.name,
      parentId: change.folder.parentId,
    }
  else if (change.kind === 'folder-delete')
    body = { expectedRevision: change.folder.revision, expectedVersionId: change.folder.versionId }
  else
    body = {
      name: change.folder.name,
      parentId: change.folder.parentId,
      expectedRevision: change.expectedRevision,
      expectedVersionId: change.expectedVersionId,
    }
  let method = 'PUT'
  if (isCreate) method = 'POST'
  else if (change.kind === 'folder-delete') method = 'DELETE'
  const result = await fetchJson(
    isCreate ? root : `${root}/${change.folder.id}`,
    folderWriteResultSchema,
    {
      method,
      headers,
      body: JSON.stringify(body),
    },
  )
  assertCurrent()
  if (change.kind === 'folder-delete') {
    if (result.folder !== null || result.moved.length > 0)
      throw new Error('The server returned an unexpected folder deletion result.')
    return change
  }
  if (
    result.folder?.id !== change.folder.id ||
    result.folder.organizationId !== organizationId ||
    result.folder.kind !== change.folder.kind ||
    result.folder.name !== change.folder.name ||
    result.folder.parentId !== change.folder.parentId ||
    result.folder.revision !== change.folder.revision ||
    result.folder.versionId !== change.folder.versionId
  )
    throw new Error('The server acknowledged a different folder. Local changes were retained.')
  return { ...change, folder: result.folder }
}
