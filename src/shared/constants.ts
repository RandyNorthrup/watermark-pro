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

/** Transactional email backends. `console` logs instead of sending and is refused in production. */
export const EMAIL_PROVIDERS = ['console', 'cloudflare'] as const

/** Minimum length of BETTER_AUTH_SECRET; 32 characters of a random string is the Better Auth recommendation. */
export const AUTH_SECRET_MIN_LENGTH = 32

/** Password policy enforced by Better Auth and mirrored in client-side validation. */
export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MAX_LENGTH = 128

/** Session lifetime and refresh cadence, in seconds. */
export const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7
export const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24

/** Lifetime of email verification, password reset, and invitation tokens, in seconds. */
export const VERIFICATION_TOKEN_TTL_SECONDS = 60 * 60
export const INVITATION_TTL_SECONDS = 60 * 60 * 24 * 7

/**
 * Rate limiting. The Workers Rate Limiting bindings in wrangler.jsonc carry
 * the authoritative limits; these values describe them to Better Auth so its
 * Retry-After headers are accurate. Keep the two in sync.
 */
export const AUTH_RATE_LIMIT = { windowSeconds: 60, max: 10 } as const
export const API_RATE_LIMIT = { windowSeconds: 60, max: 120 } as const

/** Auth endpoints that get the strict limiter; everything else under /api/auth gets the general one. */
export const SENSITIVE_AUTH_PATHS = [
  '/sign-in/email',
  '/sign-up/email',
  '/forget-password',
  '/reset-password',
  '/send-verification-email',
  '/verify-email',
  '/change-password',
] as const

/**
 * Better Auth's platform-wide admin role (distinct from organization roles).
 * Never granted through the product API; see docs/runbook.md.
 */
export const PLATFORM_ADMIN_ROLE = 'admin'

/**
 * The bundled sample scene the editor and designer show before the engine's
 * first frame, written to `public/` by `scripts/sample-scene.mjs`.
 */
export const SAMPLE_SCENE_PATH = '/sample-scene.jpg'

/** Library limits. */
export const MAX_PRESET_NAME_LENGTH = 60
export const BYTES_PER_MEGABYTE = 1024 * 1024
export const MAX_LOGO_BYTES = 5 * BYTES_PER_MEGABYTE
export const MAX_LOGOS_PER_ORGANIZATION = 50

/** Stored photos (M6): per-file, per-organization and page limits. */
export const MAX_PHOTO_BYTES = 40 * BYTES_PER_MEGABYTE
export const MAX_THUMBNAIL_BYTES = 1 * BYTES_PER_MEGABYTE
export const MAX_PHOTOS_PER_ORGANIZATION = 10_000
export const MAX_STORAGE_BYTES_PER_ORGANIZATION = 2 * 1024 * BYTES_PER_MEGABYTE
export const MAX_PHOTO_SIDE = 8192
export const PHOTO_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export const PHOTO_PAGE_SIZE = 60
export const MAX_BULK_DELETE = 200
export const MAX_PHOTO_NAME_LENGTH = 200
export const MAX_CURSOR_LENGTH = 100

/** Share links (M7). */
export const MAX_SHARE_PHOTOS = 200
export const SHARE_PATH_PREFIX = '/share/'
/** Expiry choices offered when creating a link, in days. */
export const SHARE_EXPIRY_DAYS = [1, 7, 30] as const
export const MILLISECONDS_PER_SECOND = 1000
export const LOGO_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

/** Font weights the watermark designer offers; variable fonts cover the range. */
export const FONT_WEIGHTS = [300, 400, 500, 600, 700, 800] as const

/** Radix for hex encoding of hash digests. */
export const HEX_RADIX = 16

/** Upper bound on audit log rows returned by one request. */
export const AUDIT_PAGE_SIZE = 50
/** Organizations shown to a platform admin, newest first. */
export const ADMIN_ORGANIZATION_PAGE_SIZE = 200

/** Ring buffer size for the console email provider's captured messages (dev/test only). */
export const DEV_MAILBOX_CAPACITY = 20

/** HTTP status codes used by the API. Named so handlers never carry bare numbers. */
export const HTTP_STATUS = {
  ok: 200,
  created: 201,
  noContent: 204,
  found: 302,
  badRequest: 400,
  unauthorized: 401,
  forbidden: 403,
  notFound: 404,
  conflict: 409,
  payloadTooLarge: 413,
  unsupportedMediaType: 415,
  tooManyRequests: 429,
  internalServerError: 500,
} as const

/** Machine-readable error codes returned in API error bodies. */
export const API_ERROR_CODE = {
  notFound: 'not_found',
  internalError: 'internal_error',
  invalidConfiguration: 'invalid_configuration',
  unauthenticated: 'unauthenticated',
  forbidden: 'forbidden',
  validation: 'validation_failed',
  rateLimited: 'rate_limited',
  conflict: 'conflict',
  payloadTooLarge: 'payload_too_large',
  unsupportedMedia: 'unsupported_media_type',
  quotaExceeded: 'quota_exceeded',
} as const

/** One year in seconds; the HSTS max-age recommended by hstspreload.org. */
export const HSTS_MAX_AGE_SECONDS = 31_536_000
