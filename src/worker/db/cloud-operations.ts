import { sql } from 'drizzle-orm'

import { CLOUD_OPERATION_POLICY, type CloudOperationSpend } from '../../shared/cloud-operations'

/** One SQLite step supplies a consistent authoritative UTC month to admission and its trigger. */
export const cloudOperationMonthSql = sql`CAST(strftime('%Y', 'now') AS INTEGER) * 12 + CAST(strftime('%m', 'now') AS INTEGER) - 1`
/** Existing independent grants and current paid expiry determine allowance inside admission. */
export const cloudOperationLimitSql = sql`
  CASE
    WHEN kind NOT IN ('personal', 'shared') OR base_plan NOT IN ('free', 'private', 'legacy')
      OR (kind = 'personal' AND base_member_limit <> 1)
      OR (paid_plan IS NOT NULL AND NOT ((paid_plan = 'pro' AND kind = 'personal') OR (paid_plan = 'team' AND kind = 'shared'))) THEN NULL
    WHEN paid_access_suspended = 0 AND paid_through > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
      AND paid_plan = 'pro' THEN ${CLOUD_OPERATION_POLICY.limits.pro}
    WHEN paid_access_suspended = 0 AND paid_through > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
      AND paid_plan = 'team' THEN ${CLOUD_OPERATION_POLICY.limits.team}
    WHEN base_plan IN ('private', 'legacy') THEN ${CLOUD_OPERATION_POLICY.limits.private}
    ELSE ${CLOUD_OPERATION_POLICY.limits.free} END
`
/** Recheck the same live permission or signed-share scope at the counter mutation boundary. */
export function cloudOperationAuthoritySql(input: CloudOperationSpend) {
  if (input.kind === 'member')
    return sql`
      EXISTS (
          SELECT 1 FROM member m JOIN user u ON u.id = m.user_id
          WHERE m.organization_id = workspace_plan.organization_id AND m.user_id = ${input.userId}
            AND m.role IN (${sql.join(
              input.roles.map((role) => sql`${role}`),
              sql`, `,
            )})
            AND u.email_verified = 1 AND coalesce(u.banned, 0) = 0 AND u.membership_cohort IN ('private', 'public'))
    `
  return sql`
    EXISTS (SELECT 1 FROM share s WHERE s.id = ${input.shareId}
        AND s.organization_id = workspace_plan.organization_id AND s.revoked_at IS NULL
        AND s.expires_at = ${input.expiresAt}
        AND (s.expires_at = 0 OR s.expires_at > CAST(strftime('%s', 'now') AS INTEGER))
        AND (${input.photoId ?? null} IS NULL OR EXISTS (SELECT 1 FROM json_each(s.photo_ids) WHERE value = ${input.photoId ?? null})))
  `
}
/** Wrapped D1 errors disclose only finite guard names; never return or log raw query/body text. */
export function cloudOperationGuardFailure(error: unknown): 'quota' | 'authority' | null {
  let current = error
  while (current instanceof Error) {
    if (current.message.includes('cloud_operation_site_exhausted')) return 'quota'
    if (current.message.includes('cloud_operation_authority_invalid')) return 'authority'
    current = current.cause
  }
  return null
}
