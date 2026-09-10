import { createFileRoute, redirect } from '@tanstack/react-router'

import { LandingPage } from '../components/landing-page'

export const Route = createFileRoute('/')({
  beforeLoad: async ({ context }) => {
    const { sessionQueryOptions } = await import('../lib/queries')
    const session = navigator.onLine
      ? await context.queryClient.query(sessionQueryOptions)
      : (context.queryClient.getQueryData(sessionQueryOptions.queryKey) ?? null)
    if (session !== null) {
      throw redirect({ to: '/app' })
    }
  },
  component: LandingPage,
})
