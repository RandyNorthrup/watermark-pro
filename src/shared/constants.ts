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

/** Standard sepia colour matrix, row-major 3×3 (R, G, B output rows). */
export const SEPIA_MATRIX = [
  [0.393, 0.769, 0.189],
  [0.349, 0.686, 0.168],
  [0.272, 0.534, 0.131],
] as const

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
  unsupportedUrl: 'unsupported_url',
} as const

/** One year in seconds; the HSTS max-age recommended by hstspreload.org. */
export const HSTS_MAX_AGE_SECONDS = 31_536_000

/** Standard camera shutter denominators; a raw exposure time snaps to the nearest for the `{shutter}` token. */
export const COMMON_SHUTTER_DENOMINATORS = [
  1, 2, 4, 8, 15, 30, 60, 125, 250, 500, 1000, 2000, 4000, 8000,
] as const

/** Preset file import/export (M15): a portable `.wmp.json` bundle of presets and their logos. */
export const PRESET_FILE_FORMAT = 'watermark-pro/presets'
export const PRESET_FILE_VERSION = 1
export const MAX_PRESET_FILE_PRESETS = 100
export const MAX_PRESET_FILE_BYTES = 40 * BYTES_PER_MEGABYTE

/** Logo prepare tools (M15): background removal tolerance and the alpha level a trim treats as empty. */
export const DEFAULT_BACKGROUND_TOLERANCE = 24
export const MAX_BACKGROUND_TOLERANCE = 60
export const ALPHA_TRIM_THRESHOLD = 8

/**
 * Invisible (steganographic) mark (M15). PNG-only, lossless: the payload is
 * `WMP1` + length + UTF-8 message + CRC-32, written to the blue-channel LSB of
 * pixels visited along a seeded walk (stride = the first of these primes that
 * is coprime to the pixel count; start from `mulberry32(SEED ^ length)`).
 */
export const INVISIBLE_MAGIC = 'WMP1'
export const MAX_INVISIBLE_MESSAGE_LENGTH = 64
export const INVISIBLE_MARK_SEED = 2_654_435_769
export const INVISIBLE_STRIDE_PRIMES = [7919, 104_729, 1_299_709, 15_485_863] as const

/**
 * Import from a URL (M16): the Worker fetches the photo server-side under an
 * SSRF policy. A dedicated rate limit, a short timeout, and a small redirect
 * cap (each hop re-checked) bound the request; the size cap is `MAX_PHOTO_BYTES`.
 */
export const IMPORT_RATE_LIMIT = { windowSeconds: 60, max: 10 } as const
export const IMPORT_TIMEOUT_MS = 15_000
export const IMPORT_MAX_REDIRECTS = 3

/** Camera capture (M16): the OS camera app, launched by the file input's `capture` attribute. */
export const CAMERA_ACCEPT = 'image/*'

/**
 * Web Share Target (M16, Android): the service worker stashes shared files in
 * IndexedDB for the bulk page to pick up, discarding anything older than the TTL.
 */
export const SHARED_FILES_DB = 'watermark-pro-shared'
export const SHARED_FILES_STORE = 'pending'
export const SHARED_FILES_TTL_MS = 10 * 60 * MILLISECONDS_PER_SECOND

/**
 * Cloud import pickers (M16). Each provider loads its vendor SDK from these
 * exact origins on demand and is offered only when its keys (see
 * src/worker/env.ts, surfaced through GET /api/config) are configured. The
 * origins are also the CSP allowances in public/_headers, so the two must move
 * together. Google requests the narrow per-file `drive.file` scope (which also
 * covers writing back the files the app creates) and reads/writes through the
 * Drive media and upload endpoints; Dropbox reads via the Chooser's short-lived
 * direct links and writes through its content API after a PKCE sign-in; OneDrive
 * signs in with MSAL and reads/writes through Microsoft Graph with `Files.ReadWrite`.
 */
export const GOOGLE_API_SCRIPT_URL = 'https://apis.google.com/js/api.js'
export const GOOGLE_IDENTITY_SCRIPT_URL = 'https://accounts.google.com/gsi/client'
export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
export const GOOGLE_DRIVE_FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files'
/** Multipart upload endpoint for creating a Drive file (M16 save-to-cloud). */
export const GOOGLE_DRIVE_UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/drive/v3/files'
export const DROPBOX_DROPINS_SCRIPT_URL = 'https://www.dropbox.com/static/api/2/dropins.js'
/** Dropbox write (M16 save-to-cloud): browser PKCE sign-in, then the content API. */
export const DROPBOX_OAUTH_AUTHORIZE_URL = 'https://www.dropbox.com/oauth2/authorize'
export const DROPBOX_OAUTH_TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token'
export const DROPBOX_UPLOAD_ENDPOINT = 'https://content.dropboxapi.com/2/files/upload'
export const DROPBOX_OAUTH_REDIRECT_PATH = '/oauth/dropbox'
/** Space-separated Dropbox scopes for the save flow (write, plus read for parity). */
export const DROPBOX_WRITE_SCOPES = 'files.content.write files.content.read files.metadata.read'
/** `common` accepts both Microsoft Entra (work/school) and personal accounts. */
export const MICROSOFT_AUTHORITY = 'https://login.microsoftonline.com/common'
/** `Files.ReadWrite` covers both the OneDrive browse (read) and save (write) flows. */
export const MICROSOFT_GRAPH_SCOPE = 'Files.ReadWrite'
export const MICROSOFT_GRAPH_ROOT = 'https://graph.microsoft.com/v1.0'
/** Registered SPA redirect path for the MSAL popup; joined onto the app origin. */
export const MICROSOFT_OAUTH_REDIRECT_PATH = '/oauth/microsoft'
/** Folder each provider saves watermarked photos into (created if missing). */
export const CLOUD_SAVE_FOLDER = 'Watermark Pro'

/**
 * Video watermarking (M17). Everything runs in the browser through WebCodecs and
 * mediabunny; a file larger than any limit is refused before it is decoded.
 */
export const MAX_VIDEO_BYTES = 2 * 1024 * BYTES_PER_MEGABYTE
export const MAX_VIDEO_SECONDS = 600
export const MAX_VIDEO_SIDE = 3840
/**
 * Encoder codec preference, best first (docs/plans/m17 "Codec choice"): H.264 in
 * MP4, then HEVC in MP4 (Safari), then VP9 and AV1 in WebM. The first the running
 * browser can encode wins; the container follows the codec (see CODEC_CONTAINER).
 * These are mediabunny codec ids, kept as strings so this shared module pulls in
 * no browser-only dependency.
 */
export const VIDEO_CODEC_PREFERENCE = ['avc', 'hevc', 'vp9', 'av1'] as const
/** Audio encoder preference: AAC for MP4, Opus for WebM. */
export const AUDIO_CODEC_PREFERENCE = ['aac', 'opus'] as const
/** Which container each video codec is muxed into. */
export const CODEC_CONTAINER = { avc: 'mp4', hevc: 'mp4', vp9: 'webm', av1: 'webm' } as const
/**
 * Target video bitrate for a 1080p frame, in bits per second; the transcoder
 * scales these by the actual pixel count so smaller frames get proportionally
 * fewer bits. Low/Standard/High are the user-facing "Quality" choices.
 */
export const VIDEO_BITRATE_LADDER = {
  low: 2_000_000,
  standard: 6_000_000,
  high: 12_000_000,
} as const
/** Reference frame area the ladder is quoted at (1920×1080). */
export const VIDEO_BITRATE_REFERENCE_PIXELS = 1920 * 1080
/** Heights offered by the "Fit" resolution options; "Original" keeps the source. */
export const VIDEO_FIT_HEIGHTS = { '1080p': 1080, '720p': 720 } as const
/** Bitrate for re-encoded audio when it cannot be copied through, in bits per second. */
export const AUDIO_REENCODE_BITRATE = 128_000

/**
 * PDF watermarking (M17). pdf-lib parses and writes each document in the browser;
 * the chosen layers are rasterised once per distinct page size and drawn on every
 * page. Encrypted documents are refused.
 */
export const MAX_PDF_BYTES = 50 * BYTES_PER_MEGABYTE
export const MAX_PDF_PAGES = 200
export const MAX_PDF_FILES = 50
/** Resolution the marks are rasterised at before being drawn onto the page. */
export const PDF_RASTER_DPI = 150
/** Points per inch in the PDF coordinate system (a PDF user unit is 1/72 inch). */
export const PDF_POINTS_PER_INCH = 72
/** Written into the output PDF's Info dictionary. */
export const PDF_PRODUCER = 'Watermark Pro'
