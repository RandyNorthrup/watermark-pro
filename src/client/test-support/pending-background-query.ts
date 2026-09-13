import { type QueryClient, QueryObserver } from '@tanstack/react-query'
import { vi } from 'vitest'

/** A real active query whose unresolved work must never block a shell-only transition. */
export function pendingBackgroundQuery(queryClient: QueryClient) {
  const pending = Promise.withResolvers<string>()
  const queryKey = ['unrelated-media-preparation']
  const observer = new QueryObserver(queryClient, { queryKey, queryFn: () => pending.promise })
  const unsubscribe = observer.subscribe(vi.fn())
  return {
    isPending: () => queryClient.getQueryState(queryKey)?.fetchStatus === 'fetching',
    complete: () => {
      pending.resolve('complete')
      unsubscribe()
    },
  }
}
