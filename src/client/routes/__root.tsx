import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, lazyRouteComponent, Outlet } from '@tanstack/react-router'

export interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  // The router never code-splits the root route, so the fallback page is
  // loaded explicitly to keep it out of the application shell.
  notFoundComponent: lazyRouteComponent(
    () => import('../components/not-found-page'),
    'NotFoundPage',
  ),
})
