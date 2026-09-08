import { createFileRoute, getRouteApi } from '@tanstack/react-router'

import { Alert } from '../../components/ui/alert'
import { VideoTool } from '../../components/video/video-tool'
import { activeMemberRoleQueryOptions } from '../../lib/queries'
import { canRole } from '../../lib/roles'

const appRoute = getRouteApi('/app')

export const Route = createFileRoute('/app/video')({
  loader: async ({ context }) => await context.queryClient.query(activeMemberRoleQueryOptions),
  component: VideoPage,
})

function VideoPage() {
  const organization = appRoute.useLoaderData()
  const membership = Route.useLoaderData()
  if (organization === null) {
    return <Alert tone="info">Create or join an organization to watermark video.</Alert>
  }
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Video watermarking</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Apply a preset to a whole video. Every frame is watermarked in your browser and the audio
          is kept; nothing is uploaded.
        </p>
      </header>
      <VideoTool
        organizationId={organization.id}
        organizationName={organization.name}
        canSave={canRole(membership?.role, { photo: ['upload'] })}
      />
    </div>
  )
}
