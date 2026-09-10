/** The gate supports only the proven, disjoint Worker-first rules in the built application. */
export const GATE_WORKER_PATTERNS = ['/api/*', '/', '/privacy', '/terms']
const EXACT_WORKER_PATHS = new Set(GATE_WORKER_PATTERNS.slice(1))

/** Matches URL pathnames only; native assets retain all redirects, SPA and method handling. */
export function isGateWorkerPath(pathname) {
  return pathname.startsWith('/api/') || EXACT_WORKER_PATHS.has(pathname)
}
