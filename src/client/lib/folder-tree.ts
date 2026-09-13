import { FOLDER_POLICY, type FolderDto } from '../../shared/folders'

/** A bounded breadcrumb walk also rejects stale selections and damaged cached ancestry. */
export function folderPath(folders: readonly FolderDto[], id: string | null): FolderDto[] | null {
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const path: FolderDto[] = []
  const seen = new Set<string>()
  let current = id
  while (current !== null) {
    if (seen.has(current) || path.length >= FOLDER_POLICY.maxDepth) return null
    seen.add(current)
    const folder = byId.get(current)
    if (folder === undefined) return null
    path.unshift(folder)
    current = folder.parentId
  }
  return path
}

/** Moving a folder can never target itself or any descendant. */
export function excludedFolderDestinations(
  folders: readonly FolderDto[],
  id: string | undefined,
): ReadonlySet<string> {
  const excluded = new Set<string>()
  if (id === undefined) return excluded
  const pending = [id]
  while (pending.length > 0) {
    const current = pending.pop()
    if (current === undefined || excluded.has(current)) continue
    excluded.add(current)
    for (const child of folders) if (child.parentId === current) pending.push(child.id)
  }
  return excluded
}
