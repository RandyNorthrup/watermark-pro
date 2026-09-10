/**
 * Schemas needed by core transport and shell queries. Keeping this leaf separate
 * avoids initializing media, sharing, development and administration validators
 * before the user opens those features.
 */
import { z } from 'zod'

import { API_ERROR_CODE } from './constants'

export const apiErrorSchema = z.object({
  error: z.enum([
    API_ERROR_CODE.notFound,
    API_ERROR_CODE.internalError,
    API_ERROR_CODE.invalidConfiguration,
    API_ERROR_CODE.unauthenticated,
    API_ERROR_CODE.forbidden,
    API_ERROR_CODE.validation,
    API_ERROR_CODE.rateLimited,
    API_ERROR_CODE.conflict,
    API_ERROR_CODE.payloadTooLarge,
    API_ERROR_CODE.unsupportedMedia,
    API_ERROR_CODE.quotaExceeded,
    API_ERROR_CODE.unsupportedUrl,
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

/** Configuration the browser may know before signing in. */
export const publicConfigSchema = z.object({
  googleAuthEnabled: z.boolean().default(false),
  microsoftAuthEnabled: z.boolean().default(false),
  /** Turnstile site key when bot protection is enabled; null otherwise. */
  turnstileSiteKey: z.string().nullable(),
  /** Cloud import (M16): each picker is offered only when its keys are configured; null hides it. */
  googleOAuthClientId: z.string().nullable(),
  googlePickerApiKey: z.string().nullable(),
  googlePickerAppId: z.string().nullable(),
  microsoftClientId: z.string().nullable(),
  dropboxAppKey: z.string().nullable(),
})

export type PublicConfig = z.infer<typeof publicConfigSchema>
