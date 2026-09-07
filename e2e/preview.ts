/**
 * Where the production build is served for the end-to-end suite. Must match
 * APP_URL in wrangler.jsonc: the Worker only accepts state-changing requests
 * from that origin, so the preview has to be served from it.
 */
export const PREVIEW_PORT = 5173
export const PREVIEW_ORIGIN = `http://localhost:${String(PREVIEW_PORT)}`
