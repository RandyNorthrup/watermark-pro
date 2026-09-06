import { QueryClient } from '@tanstack/react-query'

/** Milliseconds before a cached query is considered stale. */
const DEFAULT_STALE_TIME_MS = 30_000

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: DEFAULT_STALE_TIME_MS,
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  })
}
