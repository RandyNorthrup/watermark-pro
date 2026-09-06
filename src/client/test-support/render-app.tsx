import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render } from '@testing-library/react'

import { createQueryClient } from '../lib/query-client'
import { createAppRouter } from '../router'

/**
 * Mounts the real application router at `path` with a fresh query client
 * and memory history. Pair with the fake auth client (`vi.mock` of
 * `../lib/auth-client`) to drive full page flows in jsdom.
 */
export function renderApp(path: string) {
  const queryClient = createQueryClient()
  const router = createAppRouter(queryClient, createMemoryHistory({ initialEntries: [path] }))
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { ...view, router, queryClient }
}
