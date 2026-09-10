/** Account cleanup must not initialize private snapshot validation on public routes. */
export const SHELL_STORAGE_KEY = 'watermark-pro:query-cache'

/** Storage denial does not prevent online account cleanup. */
export function clearPersistedQueries(storage?: Storage): void {
  try {
    ;(storage ?? localStorage).removeItem(SHELL_STORAGE_KEY)
  } catch {
    /* Online sign-out still succeeds when storage is denied. */
  }
}
