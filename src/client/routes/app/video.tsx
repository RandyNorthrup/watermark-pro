import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { videoTool } from '../../components/tool-modules'
import { ToolSuspense } from '../../components/tool-suspense'
import { Alert } from '../../components/ui/alert'
import { useActiveOrganization } from '../../lib/active-organization'
import { readActiveMemberRole } from '../../lib/queries'
import { canRole } from '../../lib/roles'

export const Route = createFileRoute('/app/video')({
  loader: async ({ context }) => {
    videoTool.preload()
    return await readActiveMemberRole(context.queryClient)
  },
  component: VideoPage,
})

function VideoPage() {
  const { t } = useTranslation()
  const organization = useActiveOrganization()
  const membership = Route.useLoaderData()
  if (organization === null) {
    return <Alert tone="info">{t('video.orgRequired')}</Alert>
  }
  return (
    <div className="flex flex-col gap-3">
      <header className="studio-page-heading">
        <h1 className="text-xl font-semibold tracking-tight">{t('video.heading')}</h1>
        <p className="text-xs text-ink-muted">{t('video.description')}</p>
      </header>
      <ToolSuspense>
        <videoTool.Component
          organizationId={organization.id}
          canCreatePresets={canRole(membership?.role, { watermark: ['create'] })}
        />
      </ToolSuspense>
    </div>
  )
}
