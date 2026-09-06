import { HTTPException } from 'hono/http-exception'

import type { ApiError } from '../shared/api'
import { API_ERROR_CODE, HTTP_STATUS } from '../shared/constants'

function jsonError(status: number, error: ApiError['error']): Response {
  const body: ApiError = { error }
  return Response.json(body, { status })
}

/** Typed HTTP errors so handlers never build ad-hoc error responses. */
export const apiErrors = {
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
}
