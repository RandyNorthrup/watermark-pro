/**
 * Project-wide named constants.
 *
 * This is the one module where literal values are allowed to appear without a
 * named binding (`@typescript-eslint/no-magic-numbers` is disabled for it in
 * eslint.config.mjs). Everything tunable lives here or in a typed config
 * object; nowhere else in `src/` should a bare number or string carry meaning.
 *
 * Shared between the browser client and the Worker: no DOM, no Workers
 * globals, no imports from either side.
 */

export const APP_NAME = 'Watermark Pro'

export const APP_TAGLINE = 'Watermark photographs at scale, beautifully.'

/** Prefix under which every Worker-handled route lives. Mirrors `run_worker_first` in wrangler.jsonc. */
export const API_PREFIX = '/api'

export const HEALTH_PATH = `${API_PREFIX}/health`

/** Deployment environments the Worker accepts in `APP_ENV`. */
export const APP_ENVIRONMENTS = ['development', 'test', 'staging', 'production'] as const

/** HTTP status codes used by the API. Named so handlers never carry bare numbers. */
export const HTTP_STATUS = {
  ok: 200,
  badRequest: 400,
  unauthorized: 401,
  forbidden: 403,
  notFound: 404,
  internalServerError: 500,
} as const

/** Machine-readable error codes returned in API error bodies. */
export const API_ERROR_CODE = {
  notFound: 'not_found',
  internalError: 'internal_error',
  invalidConfiguration: 'invalid_configuration',
} as const

/** One year in seconds; the HSTS max-age recommended by hstspreload.org. */
export const HSTS_MAX_AGE_SECONDS = 31_536_000
