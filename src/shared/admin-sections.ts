/** Stable administration destinations shared by the route and site navigation. */
import { z } from 'zod/mini'

/** Section values are URL identifiers, independent of translated navigation labels. */
export const ADMIN_SECTIONS = [
  'users',
  'organizations',
  'audit',
  'health',
  'client-errors',
] as const
/** A validated administration destination. */
export type AdminSection = (typeof ADMIN_SECTIONS)[number]
/** Missing sections select Users; invalid explicit values fail route validation. */
export const adminSearchSchema = z.object({
  section: z._default(z.enum(ADMIN_SECTIONS), 'users'),
})

/** Resolve an untrusted search object using the same contract as the route. */
export function parseAdminSection(search: unknown): AdminSection {
  return adminSearchSchema.parse(search).section
}
