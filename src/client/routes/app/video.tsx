import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { VideoTool } from '../../components/video/video-tool'
import { readActiveMemberRole } from '../../lib/queries'
import { canRole } from '../../lib/roles'

const appRoute = getRouteApi('/app')

export const Route = createFileRoute('/app/video')({
  loader: async ({ context }) => await readActiveMemberRole(context.queryClient),
  component: VideoPage,
})

function VideoPage() {
  const { t } = useTranslation()
  const organization = appRoute.useLoaderData()
  const membership = Route.useLoaderData()
  if (organization === null) {
    return <Alert tone="info">{t('video.orgRequired')}</Alert>
  }
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">{t('video.heading')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('video.description')}</p>
      </header>
      <VideoTool
        organizationId={organization.id}
        organizationName={organization.name}
        canSave={canRole(membership?.role, { photo: ['upload'] })}
      />
    </div>
  )
}
