import { z } from 'zod'

import {
  BYTES_PER_MEGABYTE,
  MAX_LOGOS_PER_ORGANIZATION,
  MAX_PHOTOS_PER_ORGANIZATION,
  MAX_STORAGE_BYTES_PER_ORGANIZATION,
} from './constants'

const PLAN_CONFIGURATION = {
  workspaceIdCharacters: 128,
  megabytesPerGigabyte: 1024,
  freeStorageMiB: 500,
  proStorageGiB: 10,
  teamStorageGiB: 25,
} as const

/** Bounded path identity is still authorized against actual workspace membership. */
export const workspaceCapacityRequestSchema = z
  .object({
    orgId: z.string().min(1).max(PLAN_CONFIGURATION.workspaceIdCharacters),
  })
  .strict()

/** Public monthly USD catalog; private grants are never advertised as a purchasable plan. */
export const PUBLIC_PLANS = {
  free: {
    monthlyUsd: 0,
    storageBytes: PLAN_CONFIGURATION.freeStorageMiB * BYTES_PER_MEGABYTE,
    photos: 100,
    logos: 10,
    presets: 20,
    members: 1,
  },
  pro: {
    monthlyUsd: 9,
    storageBytes:
      PLAN_CONFIGURATION.proStorageGiB *
      PLAN_CONFIGURATION.megabytesPerGigabyte *
      BYTES_PER_MEGABYTE,
    photos: 10_000,
    logos: 50,
    presets: 1000,
    members: 1,
  },
  team: {
    monthlyUsd: 24,
    storageBytes:
      PLAN_CONFIGURATION.teamStorageGiB *
      PLAN_CONFIGURATION.megabytesPerGigabyte *
      BYTES_PER_MEGABYTE,
    photos: 10_000,
    logos: 100,
    presets: 2000,
    members: 3,
  },
} as const

/** Independent historical/private storage grants retain existing content and membership. */
export const PRIVATE_PLAN_CAPACITY = {
  storageBytes: MAX_STORAGE_BYTES_PER_ORGANIZATION,
  photos: MAX_PHOTOS_PER_ORGANIZATION,
  logos: MAX_LOGOS_PER_ORGANIZATION,
  presets: 1000,
  sharedMembers: 3,
  sharedWorkspaces: 1,
} as const

/** Server-owned creation provenance is immutable across client metadata and membership changes. */
export const WORKSPACE_CREATION_KIND = {
  personal: 'personal',
  shared: 'shared',
  historical: 'historical',
  paid: 'paid',
} as const
export type WorkspaceCreationKind =
  (typeof WORKSPACE_CREATION_KIND)[keyof typeof WORKSPACE_CREATION_KIND]

const WORKSPACE_BASE_PLAN = { free: 'free', private: 'private', legacy: 'legacy' } as const
const workspaceBasePlanSchema = z.enum(WORKSPACE_BASE_PLAN)
const paidPlanSchema = z.enum(['pro', 'team'])
const workspaceKindSchema = z.enum(['personal', 'shared'])

/** Authority is persisted by the server; role, metadata and browser plan names cannot grant capacity. */
export const workspacePlanRecordSchema = z
  .object({
    organizationId: z.string().min(1),
    kind: workspaceKindSchema,
    basePlan: workspaceBasePlanSchema,
    baseMemberLimit: z.number().int().positive(),
    retainedMemberLimit: z.number().int().positive(),
    paidPlan: paidPlanSchema.nullable(),
    paidThrough: z.date().nullable(),
    paidAccessSuspended: z.boolean(),
    revision: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((record, context) => {
    if (
      (record.paidPlan === 'pro' && record.kind !== 'personal') ||
      (record.paidPlan === 'team' && record.kind !== 'shared')
    )
      context.addIssue({ code: 'custom', message: 'Paid plan does not match workspace kind.' })
    if (record.kind === 'personal' && record.baseMemberLimit !== 1)
      context.addIssue({ code: 'custom', message: 'Personal workspaces have one member.' })
  })

export type WorkspacePlanRecord = z.infer<typeof workspacePlanRecordSchema>
/** Limits only; prices and private admission rights are separate decisions. */
export interface WorkspaceCapacity {
  storageBytes: number
  photos: number
  logos: number
  presets: number
  members: number
}
/** Member-visible limits disclose no billing identifiers or another person's cohort. */
export const workspaceCapacitySchema = z
  .object({
    storageBytes: z.number().int().nonnegative(),
    photos: z.number().int().nonnegative(),
    logos: z.number().int().nonnegative(),
    presets: z.number().int().nonnegative(),
    members: z.number().int().positive(),
  })
  .strict()
function limits(plan: WorkspaceCapacity): WorkspaceCapacity {
  return {
    storageBytes: plan.storageBytes,
    photos: plan.photos,
    logos: plan.logos,
    presets: plan.presets,
    members: plan.members,
  }
}

/** Effective capacity includes paid-period expiry and suspension; downgrades never delete content. */
export function workspaceCapacity(
  record: WorkspacePlanRecord,
  now = Date.now(),
): WorkspaceCapacity {
  const trusted = workspacePlanRecordSchema.parse(record)
  const baseMembers = Math.max(
    trusted.retainedMemberLimit,
    trusted.basePlan === WORKSPACE_BASE_PLAN.free
      ? PUBLIC_PLANS.free.members
      : Math.max(trusted.baseMemberLimit, PRIVATE_PLAN_CAPACITY.sharedMembers),
  )
  if (
    trusted.paidPlan !== null &&
    !trusted.paidAccessSuspended &&
    trusted.paidThrough !== null &&
    trusted.paidThrough.getTime() > now
  )
    return {
      ...limits(PUBLIC_PLANS[trusted.paidPlan]),
      members: Math.max(PUBLIC_PLANS[trusted.paidPlan].members, baseMembers),
    }
  if (trusted.basePlan === WORKSPACE_BASE_PLAN.free)
    return { ...limits(PUBLIC_PLANS.free), members: baseMembers }
  return {
    storageBytes: PRIVATE_PLAN_CAPACITY.storageBytes,
    photos: PRIVATE_PLAN_CAPACITY.photos,
    logos: PRIVATE_PLAN_CAPACITY.logos,
    presets: PRIVATE_PLAN_CAPACITY.presets,
    members: baseMembers,
  }
}
