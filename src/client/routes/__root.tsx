import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router'

import { buttonVariants } from '../components/ui/button-variants'

export interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: NotFound,
})

function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="max-w-prose text-ink-muted">
        The address may be mistyped, or the page may have moved.
      </p>
      <Link to="/" className={buttonVariants({ variant: 'secondary' })}>
        Back to the start
      </Link>
    </main>
  )
}
