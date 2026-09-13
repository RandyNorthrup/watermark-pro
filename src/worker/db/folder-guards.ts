import { sql, type SQLWrapper } from 'drizzle-orm'

import type { FolderKind } from '../../shared/folders'

/** Site administration alone never grants access to somebody else's workspace. */
export const workspaceWriter = (
  organizationId: string | SQLWrapper,
  userId: string | SQLWrapper,
) => sql`
  EXISTS (
    SELECT 1 FROM member AS folder_actor JOIN user AS folder_user ON folder_user.id = folder_actor.user_id
    WHERE folder_actor.organization_id = ${organizationId} AND folder_actor.user_id = ${userId}
      AND folder_actor.role IN ('owner', 'admin', 'editor')
      AND folder_user.email_verified = 1 AND coalesce(folder_user.banned, 0) = 0
  )
`

/** NULL denotes the collection root; every other destination must match the workspace and kind. */
export const folderDestination = (
  organizationId: string | SQLWrapper,
  kind: FolderKind | SQLWrapper,
  folderId: string | null | SQLWrapper,
) => sql`
  (
    ${folderId} IS NULL OR EXISTS (SELECT 1 FROM workspace_folder AS destination_folder
      WHERE destination_folder.id = ${folderId} AND destination_folder.organization_id = ${organizationId} AND destination_folder.kind = ${kind})
  )
`
