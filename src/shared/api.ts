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
    API_ERROR_CODE.unauthenticated,
    API_ERROR_CODE.forbidden,
    API_ERROR_CODE.validation,
    API_ERROR_CODE.rateLimited,
  ]),
  details: z.unknown().optional(),
})

export type ApiError = z.infer<typeof apiErrorSchema>

export const auditEntrySchema = z.object({
  id: z.string(),
  organizationId: z.string().nullable(),
  actorUserId: z.string().nullable(),
  actorName: z.string().nullable(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.iso.datetime(),
})

export const auditListResponseSchema = z.object({
  entries: z.array(auditEntrySchema),
})

export type AuditListResponse = z.infer<typeof auditListResponseSchema>

const devMailboxMessageSchema = z.object({
  to: z.string(),
  subject: z.string(),
  text: z.string(),
})

export const devMailboxResponseSchema = z.object({
  messages: z.array(devMailboxMessageSchema),
})

export type DevMailboxResponse = z.infer<typeof devMailboxResponseSchema>
