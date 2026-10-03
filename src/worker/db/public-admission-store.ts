import { sql } from 'drizzle-orm'

import { PUBLIC_SIGNUP_POLICY } from '../../shared/public-signup'
import { publicAdmissionEmailHash } from '../auth/public-admission-key'
import type { PublicAdmissionStore } from '../public-admission-store'
import type { Database } from './client'

const capacity = (now: number) => sql`
  (SELECT COUNT(*) FROM public_admission WHERE consumed_at > ${now - PUBLIC_SIGNUP_POLICY.windowMs} OR (consumed_at IS NULL AND expires_at > ${now})) < ${PUBLIC_SIGNUP_POLICY.admissionsPerWindow}
  AND (SELECT COUNT(*) FROM user WHERE membership_cohort = 'public')
      + (SELECT COUNT(*) FROM public_admission a WHERE a.consumed_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM user u WHERE u.id = a.user_id AND u.membership_cohort <> 'pending')
         AND (a.expires_at > ${now} OR EXISTS (SELECT 1 FROM user u WHERE u.id = a.user_id AND u.membership_cohort = 'pending'))) < ${PUBLIC_SIGNUP_POLICY.maximumAccounts}
`

/** Conditional writes serialize quota holds; the migration trigger makes activation one atomic authority. */
export function createDrizzlePublicAdmissionStore(
  db: Database,
  secret: string,
): PublicAdmissionStore {
  return {
    async reserve(email) {
      const emailHash = await publicAdmissionEmailHash(email, secret)
      const now = Date.now()
      await db.run(
        sql`DELETE FROM public_admission WHERE (consumed_at IS NULL AND expires_at <= ${now} AND NOT EXISTS (SELECT 1 FROM user WHERE id = public_admission.user_id)) OR consumed_at <= ${now - PUBLIC_SIGNUP_POLICY.windowMs}`,
      )
      const userId = crypto.randomUUID()
      const rows = await db.all<{ userId: string }>(sql`
        INSERT INTO public_admission (email_hash, user_id, expires_at)
        SELECT ${emailHash}, ${userId}, ${now + PUBLIC_SIGNUP_POLICY.reservationMs} WHERE ${capacity(now)}
        ON CONFLICT (email_hash) DO NOTHING RETURNING user_id AS userId
      `)
      if (rows.length > 0) return userId
      const [existing] = await db.all<{ userId: string }>(
        sql`SELECT user_id AS userId FROM public_admission WHERE email_hash = ${emailHash} AND consumed_at IS NULL AND expires_at > ${now}`,
      )
      return existing?.userId ?? null
    },
    async activate(email, userId) {
      const emailHash = await publicAdmissionEmailHash(email, secret)
      const rows = await db.all<{ userId: string }>(sql`
        UPDATE public_admission SET consumed_at = ${Date.now()}
        WHERE email_hash = ${emailHash} AND user_id = ${userId} AND consumed_at IS NULL AND expires_at > ${Date.now()}
          AND EXISTS (SELECT 1 FROM user WHERE id = ${userId} AND lower(email) = ${email.toLowerCase()} AND membership_cohort = 'pending' AND coalesce(banned, 0) = 0)
        RETURNING user_id AS userId
      `)
      return rows.length > 0
    },
    async release(email, userId) {
      const emailHash = await publicAdmissionEmailHash(email, secret)
      await db.run(
        sql`DELETE FROM public_admission WHERE email_hash = ${emailHash} AND user_id = ${userId} AND consumed_at IS NULL AND NOT EXISTS (SELECT 1 FROM user WHERE id = ${userId})`,
      )
    },
  }
}
