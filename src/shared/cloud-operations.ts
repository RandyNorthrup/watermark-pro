import { z } from 'zod'

import { accountIdSchema } from './account-identity'
import { FOLDER_POLICY } from './folders'
import { ORGANIZATION_ROLES } from './permissions'

const weights = { read: 1, write: 4, upload: 12 } as const
const organizationRoleSchema = z.enum(ORGANIZATION_ROLES)
/** Product/operator allowances; they are neither per-actor fairness nor an invoice ceiling. */
export const CLOUD_OPERATION_POLICY = {
  limits: { free: 1000, private: 10_000, pro: 20_000, team: 60_000, site: 3_000_000 },
  weights,
  maximumDebit: weights.read + weights.write * FOLDER_POLICY.maxMoveItems,
  maximumRoles: ORGANIZATION_ROLES.length,
} as const
const common = {
  organizationId: accountIdSchema,
  units: z.number().int().positive().max(CLOUD_OPERATION_POLICY.maximumDebit),
}
/** Only server-resolved permission/share context reaches persistence; no endpoint accepts this object. */
export const cloudOperationSpendSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...common,
      kind: z.literal('member'),
      userId: accountIdSchema,
      roles: z.array(organizationRoleSchema).min(1).max(CLOUD_OPERATION_POLICY.maximumRoles),
    })
    .strict(),
  z
    .object({
      ...common,
      kind: z.literal('share'),
      shareId: accountIdSchema,
      expiresAt: z.number().int().nonnegative(),
      photoId: z.optional(accountIdSchema),
    })
    .strict(),
])
export type CloudOperationSpend = z.infer<typeof cloudOperationSpendSchema>
