/**
 * Form-level validation shared by the client (for immediate feedback) and
 * available to the Worker. Better Auth applies its own server-side checks on
 * top; these exist so the UI can explain requirements before a round trip.
 */
import { z } from 'zod'

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './constants'
import { ASSIGNABLE_ROLES } from './permissions'

/** RFC 5321 practical limit for an address. */
export const EMAIL_MAX_LENGTH = 254
export const NAME_MAX_LENGTH = 80
export const ORGANIZATION_NAME_MAX_LENGTH = 60
export const SLUG_MAX_LENGTH = 48

export const emailSchema = z.email('Enter a valid email address').max(EMAIL_MAX_LENGTH)

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${String(PASSWORD_MIN_LENGTH)} characters`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${String(PASSWORD_MAX_LENGTH)} characters`)

export const nameSchema = z.string().trim().min(1, 'Enter your name').max(NAME_MAX_LENGTH)

export const signUpSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
})

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password'),
})

export const organizationNameSchema = z
  .string()
  .trim()
  .min(2, 'Use at least 2 characters')
  .max(ORGANIZATION_NAME_MAX_LENGTH)

export const slugSchema = z
  .string()
  .min(2, 'Use at least 2 characters')
  .max(SLUG_MAX_LENGTH)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, numbers and single hyphens only')

export const newOrganizationSchema = z.object({
  name: organizationNameSchema,
  slug: slugSchema,
})

export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: z.enum(ASSIGNABLE_ROLES),
})

/** Derives a URL-safe slug from a display name. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replaceAll(/[\u{0300}-\u{036F}]/gu, '')
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
}
