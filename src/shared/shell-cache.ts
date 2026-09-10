/** Explicit lightweight allowlists for offline display state; credentials never enter the snapshot. */
import { z } from 'zod/mini'

const nullableString = z.nullable(z.string())
const nullishString = z.nullish(z.string())
const displayUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  image: nullishString,
  role: nullishString,
})
export const shellSessionSchema = z
  .object({
    user: displayUserSchema,
    session: z.object({
      id: z.string(),
      userId: z.string(),
      activeOrganizationId: z._default(nullableString, null),
    }),
  })
  .check(
    z.refine(
      (value) => value.session.userId === value.user.id,
      'Session account does not match its user.',
    ),
  )
export type ShellSession = z.infer<typeof shellSessionSchema>

const organizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  logo: nullishString,
  createdAt: z.coerce.date(),
})
export const shellOrganizationsSchema = z.array(organizationSchema)
const memberSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  userId: z.string(),
  role: z.string(),
  createdAt: z.coerce.date(),
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    image: nullishString,
  }),
})
const invitationSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  email: z.string(),
  role: nullishString,
  status: z.string(),
  expiresAt: z.coerce.date(),
  inviterId: z.string(),
})
export const shellOrganizationSchema = z.extend(organizationSchema, {
  members: z.array(memberSchema),
  invitations: z.array(invitationSchema),
})
export type ShellOrganization = z.infer<typeof shellOrganizationSchema>
export const shellRoleSchema = z.object({ role: z.string() })
const shellCacheInput = z.object({
  version: z.literal(2),
  at: z.number().check(z.nonnegative()),
  session: shellSessionSchema,
  organizations: z.optional(shellOrganizationsSchema),
  organization: z.optional(z.nullable(shellOrganizationSchema)),
  role: z.optional(z.nullable(shellRoleSchema)),
})
export const shellCacheSchema = z
  .pipe(
    shellCacheInput,
    z.transform((value: z.infer<typeof shellCacheInput>) => ({
      ...value,
      organization:
        value.organization == null
          ? value.organization
          : {
              ...value.organization,
              members: value.organization.members.filter(
                (member) =>
                  member.userId === value.session.user.id &&
                  member.user.id === value.session.user.id,
              ),
              invitations: [],
            },
    })),
  )
  .check(
    z.refine(
      (value) =>
        value.organization == null ||
        value.organization.id === value.session.session.activeOrganizationId,
      'Cached workspace does not match the active account workspace.',
    ),
  )
