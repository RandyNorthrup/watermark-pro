/** Generic operator SQL; live identifiers are supplied privately at execution time. */
import { z } from 'zod'

const MAX_IDENTIFIER_LENGTH = 128
const MAX_MEMBERS = 10_000
const inputSchema = z.object({
  workspaceId: z
    .string()
    .min(1)
    .max(MAX_IDENTIFIER_LENGTH)
    .regex(/^[\w-]+$/),
  expectedMembers: z.number().int().min(1).max(MAX_MEMBERS),
})

/** Fails closed unless the selected workspace is the entire confirmed-empty initial deployment. */
export function privateWorkspaceSplit(input: {
  workspaceId: string
  expectedMembers: number
}): string[] {
  const { workspaceId, expectedMembers } = inputSchema.parse(input)
  const target = `'${workspaceId}'`
  const count = String(expectedMembers)
  return [
    'CREATE TABLE _private_workspace_cutover_guard (ok INTEGER NOT NULL CHECK (ok = 1));',
    `INSERT INTO _private_workspace_cutover_guard (ok)
SELECT CASE WHEN EXISTS (SELECT 1 FROM organization WHERE id = ${target})
  AND (SELECT COUNT(*) FROM user) = ${count}
  AND (SELECT COUNT(*) FROM organization) = 1
  AND (SELECT COUNT(*) FROM member) = ${count}
  AND (SELECT COUNT(DISTINCT user_id) FROM member WHERE organization_id = ${target}) = ${count}
  AND (SELECT COUNT(*) FROM session) = 0
  AND (SELECT COUNT(*) FROM invitation) = 0
  AND (SELECT COUNT(*) FROM private_workspace) = 0
  AND (SELECT COUNT(*) FROM watermark) = 0
  AND (SELECT COUNT(*) FROM asset) = 0
  AND (SELECT COUNT(*) FROM photo) = 0
  AND (SELECT COUNT(*) FROM share) = 0
THEN 1 ELSE 0 END;`,
    `INSERT INTO organization (id, name, slug, created_at)
SELECT 'personal-' || id, 'My workspace', 'personal-' || id, CAST(unixepoch('subsec') * 1000 AS INTEGER) FROM user;`,
    `INSERT INTO member (id, organization_id, user_id, role, created_at)
SELECT 'personal-' || id, 'personal-' || id, id, 'owner', CAST(unixepoch('subsec') * 1000 AS INTEGER) FROM user;`,
    "INSERT INTO private_workspace (user_id, organization_id) SELECT id, 'personal-' || id FROM user;",
    `DELETE FROM member WHERE organization_id = ${target};`,
    `DELETE FROM organization WHERE id = ${target};`,
    'DROP TABLE _private_workspace_cutover_guard;',
  ]
}
