/** Invitation admission is independent from captcha and from the browser's signup UI. */
import { z } from 'zod/mini'

import { MAX_INVITATION_TOKEN_LENGTH } from './constants'

export const INVITATION_HEADER = 'x-lumafoil-invitation'
export const invitationIdSchema = z
  .string()
  .check(z.minLength(1), z.maxLength(MAX_INVITATION_TOKEN_LENGTH), z.regex(/^[\w-]+$/))
export const signupSearchSchema = z.object({ invitation: z.optional(invitationIdSchema) })
