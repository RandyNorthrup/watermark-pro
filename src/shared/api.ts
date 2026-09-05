/**
 * Wire types and schemas shared by the Worker and the client. The Worker
 * validates responses against these before sending; the client validates
 * responses against them after receiving, so neither side trusts the other
 * blindly.
 */
import { z } from 'zod'

import { API_ERROR_CODE, APP_ENVIRONMENTS } from './constants'

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  environment: z.enum(APP_ENVIRONMENTS),
})

export type HealthResponse = z.infer<typeof healthResponseSchema>

export const apiErrorSchema = z.object({
  error: z.enum([
    API_ERROR_CODE.notFound,
    API_ERROR_CODE.internalError,
    API_ERROR_CODE.invalidConfiguration,
  ]),
})

export type ApiError = z.infer<typeof apiErrorSchema>
