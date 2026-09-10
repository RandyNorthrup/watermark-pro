/** Only fixed classifications and route shapes belong in remote diagnostics. */
const ERROR_CLASSES = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'URIError',
  'EvalError',
  'AggregateError',
  'AbortError',
  'NotAllowedError',
  'QuotaExceededError',
  'SecurityError',
  'NetworkError',
  'UnhandledRejection',
])
const DIAGNOSTIC_ROUTES = new Set([
  '/',
  '/app',
  '/app/account',
  '/app/admin',
  '/app/audit',
  '/app/bulk',
  '/app/documents',
  '/app/editor',
  '/app/gallery',
  '/app/invitations',
  '/app/library',
  '/app/library/new',
  '/app/members',
  '/app/organizations/new',
  '/app/shares',
  '/app/verify',
  '/app/video',
  '/check-email',
  '/forgot-password',
  '/login',
  '/privacy',
  '/reset-password',
  '/signup',
  '/terms',
  '/oauth/dropbox',
  '/oauth/microsoft',
])

/** Arbitrary error messages can contain photos, names or credentials; never retain them. */
export function classifyClientError(name: string): string {
  return ERROR_CLASSES.has(name) ? name : 'Error'
}

/** Preserve code coordinates only; reject URLs, queries, function names and non-asset paths. */
export function sanitizeErrorSource(source: string): string | undefined {
  return /^\/assets\/[\w.-]+\.js:\d+:\d+$/.test(source) ? source : undefined
}

/** Keep known route shapes without bearer links, content ids, arbitrary paths, queries or fragments. */
export function redactRoutePath(path: string): string {
  const pathname = (path.split(/[?#]/, 1)[0] ?? '').replace(/\/$/, '') || '/'
  if (DIAGNOSTIC_ROUTES.has(pathname)) return pathname
  if (/^\/app\/library\/[^/]+$/.test(pathname)) return '/app/library/:id'
  if (/^\/share\/[^/]+$/.test(pathname)) return '/share/:token'
  if (/^\/accept-invitation\/[^/]+$/.test(pathname)) return '/accept-invitation/:token'
  if (/^\/api\/share\/[^/]+\/photos\/[^/]+\/file$/.test(pathname))
    return '/api/share/:token/photos/:id/file'
  return '/unknown'
}
