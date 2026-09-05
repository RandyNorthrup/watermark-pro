import { createFileRoute } from '@tanstack/react-router'

import { APP_TAGLINE } from '../../shared/constants'
import { HealthBadge } from '../components/health-badge'
import { fetchHealth } from '../lib/api'

export const Route = createFileRoute('/')({
  loader: fetchHealth,
  component: HomePage,
  errorComponent: HomeError,
})

function HomePage() {
  const health = Route.useLoaderData()
  return (
    <section className="mx-auto flex max-w-3xl flex-col items-start gap-6 py-16">
      <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
        {APP_TAGLINE}
      </h1>
      <p className="max-w-prose text-lg text-ink-muted">
        Bulk jobs, a reusable watermark library, smart placement that keeps your mark off the
        subject, and an editor for the details. Foundation milestone in progress.
      </p>
      <HealthBadge health={health} />
    </section>
  )
}

function HomeError() {
  return (
    <section role="alert" className="mx-auto max-w-3xl py-16">
      <h1 className="text-2xl font-semibold">The API is not reachable</h1>
      <p className="mt-2 text-ink-muted">
        The Worker did not answer the health check. Check the deployment configuration.
      </p>
    </section>
  )
}
