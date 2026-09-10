import { HTTPException } from 'hono/http-exception'

import type { ApiError } from '../shared/api'
import { API_ERROR_CODE, HTTP_STATUS, UPLOAD_RETRY_AFTER_SECONDS } from '../shared/constants'

function jsonError(status: number, error: ApiError['error'], details?: unknown): Response {
  const body: ApiError = details === undefined ? { error } : { error, details }
  return Response.json(body, { status })
}

/** Typed HTTP errors so handlers never build ad-hoc error responses. */
export const apiErrors = {
  retryLater: () =>
    new HTTPException(HTTP_STATUS.serviceUnavailable, {
      res: Response.json(
        { error: API_ERROR_CODE.internalError },
        {
          status: HTTP_STATUS.serviceUnavailable,
          headers: { 'retry-after': String(UPLOAD_RETRY_AFTER_SECONDS) },
        },
      ),
    }),
  unauthenticated: () =>
    new HTTPException(HTTP_STATUS.unauthorized, {
      res: jsonError(HTTP_STATUS.unauthorized, API_ERROR_CODE.unauthenticated),
    }),
  forbidden: () =>
    new HTTPException(HTTP_STATUS.forbidden, {
      res: jsonError(HTTP_STATUS.forbidden, API_ERROR_CODE.forbidden),
    }),
  notFound: () =>
    new HTTPException(HTTP_STATUS.notFound, {
      res: jsonError(HTTP_STATUS.notFound, API_ERROR_CODE.notFound),
    }),
  validation: (details: unknown) =>
    new HTTPException(HTTP_STATUS.badRequest, {
      res: jsonError(HTTP_STATUS.badRequest, API_ERROR_CODE.validation, details),
    }),
  conflict: () =>
    new HTTPException(HTTP_STATUS.conflict, {
      res: jsonError(HTTP_STATUS.conflict, API_ERROR_CODE.conflict),
    }),
  payloadTooLarge: () =>
    new HTTPException(HTTP_STATUS.payloadTooLarge, {
      res: jsonError(HTTP_STATUS.payloadTooLarge, API_ERROR_CODE.payloadTooLarge),
    }),
  unsupportedMedia: () =>
    new HTTPException(HTTP_STATUS.unsupportedMediaType, {
      res: jsonError(HTTP_STATUS.unsupportedMediaType, API_ERROR_CODE.unsupportedMedia),
    }),
  unsupportedUrl: (reason: string) =>
    new HTTPException(HTTP_STATUS.badRequest, {
      res: jsonError(HTTP_STATUS.badRequest, API_ERROR_CODE.unsupportedUrl, reason),
    }),
  rateLimited: (retryAfterSeconds: number) =>
    new HTTPException(HTTP_STATUS.tooManyRequests, {
      res: Response.json(
        { error: API_ERROR_CODE.rateLimited },
        {
          status: HTTP_STATUS.tooManyRequests,
          headers: { 'retry-after': String(retryAfterSeconds) },
        },
      ),
    }),
  quotaExceeded: () =>
    new HTTPException(HTTP_STATUS.badRequest, {
      res: jsonError(HTTP_STATUS.badRequest, API_ERROR_CODE.quotaExceeded),
    }),
}
