/** A small account-binding contract, independent from invitation and administrative DTOs. */
import { z } from 'zod/mini'

import { MAX_ACCOUNT_ID_LENGTH } from './constants'

export const ACCOUNT_ID_HEADER = 'x-lumafoil-account-id'
export const accountIdSchema = z
  .string()
  .check(z.minLength(1), z.maxLength(MAX_ACCOUNT_ID_LENGTH), z.regex(/^[\w-]+$/))
