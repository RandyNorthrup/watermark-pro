import { createFileRoute, getRouteApi } from '@tanstack/react-router'

import { Gallery } from '../../components/gallery/gallery'
import { Alert } from '../../components/ui/alert'
import { activeMemberRoleQueryOptions } from '../../lib/queries'

const appRoute = getRouteApi('/app')

export const Route = createFileRoute('/app/gallery')({
  loader: async ({ context }) => await context.queryClient.query(activeMemberRoleQueryOptions),
  component: GalleryPage,
})

function GalleryPage() {
  const organization = appRoute.useLoaderData()
  const membership = Route.useLoaderData()
  if (organization === null) {
    return <Alert tone="info">Create or join an organization to keep a gallery.</Alert>
  }
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Gallery</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Watermarked photos saved by {organization.name}. Search, filter by preset, download or
          delete.
        </p>
      </header>
      <Gallery organizationId={organization.id} role={membership?.role} />
    </div>
  )
}
