/** Eager route metadata validates untrusted URLs without loading the application's form-schema framework. */
import { z } from 'zod/mini'

import { EMAIL_MAX_LENGTH, MAX_AUTH_ERROR_LENGTH } from './constants'
import { invitationIdSchema } from './invitation'

const authCallbackErrorSchema = z.optional(z.string().check(z.maxLength(MAX_AUTH_ERROR_LENGTH)))
export const accountSearchSchema = z.object({ error: authCallbackErrorSchema })
const redirectSchema = z.string().check(
  z.startsWith('/'),
  z.refine((path) => !path.startsWith('//') && !path.includes('\\')),
)
const presetIdSchema = z.string().check(z.minLength(1))
export const loginSearchSchema = z.object({
  redirect: z.optional(redirectSchema),
  invitation: z.optional(invitationIdSchema),
  error: authCallbackErrorSchema,
})
export const checkEmailSearchSchema = z.object({
  email: z.email('Enter a valid email address').check(z.maxLength(EMAIL_MAX_LENGTH)),
  invitation: z.optional(invitationIdSchema),
})
export const resetPasswordSearchSchema = z.object({
  token: z.optional(z.string()),
  error: z.optional(z.string()),
})
export const editorSearchSchema = z.object({ preset: z.optional(presetIdSchema) })
export const newPresetSearchSchema = z.object({ kind: z.optional(z.literal('qr')) })
