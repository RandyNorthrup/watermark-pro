/**
 * Persists the shell's session and organization queries to localStorage (M19,
 * PLAN §2), so a return visit renders the app frame from the last visit's data
 * immediately while the real requests revalidate, instead of waiting on the
 * session → organization fetch chain. The data is small and non-secret (ids,
 * names, roles) and is cleared on sign-out by the Worker's Clear-Site-Data
 * header, so a shared device keeps nothing.
 */
import { dehydrate, type DehydratedState, hydrate, type QueryClient } from '@tanstack/react-query'

import { MILLISECONDS_PER_SECOND, SECONDS_PER_DAY } from '../../shared/constants'

const STORAGE_KEY = 'watermark-pro:query-cache'
/** Persisted data older than this is discarded on load. */
const MAX_AGE_MS = SECONDS_PER_DAY * MILLISECONDS_PER_SECOND
/** Coalesce bursts of cache updates into one write. */
const PERSIST_DEBOUNCE_MS = MILLISECONDS_PER_SECOND

/** Query-key prefixes that carry shell state worth persisting (not per-org data). */
const PERSISTED_PREFIXES: readonly (readonly string[])[] = [
  ['session'],
  ['organizations'],
  ['organization', 'active'],
]

/** Whether a query key is one of the shell queries above (prefix match). */
export function isPersistedQuery(queryKey: readonly unknown[]): boolean {
  return PERSISTED_PREFIXES.some((prefix) =>
    prefix.every((part, index) => queryKey[index] === part),
  )
}

interface PersistedCache {
  at: number
  state: DehydratedState
}

/** Hydrates the query cache from the last visit when the snapshot is fresh. */
export function loadPersistedQueries(queryClient: QueryClient, storage: Storage): void {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (raw === null) {
      return
    }
    const parsed = JSON.parse(raw) as PersistedCache
    if (Date.now() - parsed.at > MAX_AGE_MS) {
      storage.removeItem(STORAGE_KEY)
      return
    }
    hydrate(queryClient, parsed.state)
  } catch {
    // Corrupt, expired-shaped or unavailable storage; start with an empty cache.
  }
}

/** Writes the current shell queries to storage. */
export function persistQueries(queryClient: QueryClient, storage: Storage): void {
  try {
    const state = dehydrate(queryClient, {
      shouldDehydrateQuery: (query) =>
        query.state.status === 'success' && isPersistedQuery(query.queryKey),
    })
    const snapshot: PersistedCache = { at: Date.now(), state }
    storage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // Private mode or quota; persistence is a convenience, not a requirement.
  }
}

/** Loads the last visit's shell queries, then persists updates (debounced). */
export function installQueryPersister(
  queryClient: QueryClient,
  storage: Storage = localStorage,
): void {
  loadPersistedQueries(queryClient, storage)
  let timer: ReturnType<typeof setTimeout> | null = null
  queryClient.getQueryCache().subscribe(() => {
    if (timer !== null) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => {
      persistQueries(queryClient, storage)
    }, PERSIST_DEBOUNCE_MS)
  })
}
