import { createFileRoute, getRouteApi, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { SAMPLE_SCENE_PATH } from '../../../../shared/constants'
import { WatermarkDesigner } from '../../../components/designer/watermark-designer'
import { Alert } from '../../../components/ui/alert'
import { activeMemberRoleQueryOptions } from '../../../lib/queries'
import { canRole } from '../../../lib/roles'

const appRoute = getRouteApi('/app')

export const Route = createFileRoute('/app/library/new')({
  staticData: { preloadImages: [SAMPLE_SCENE_PATH] },
  loader: async ({ context }) => await context.queryClient.query(activeMemberRoleQueryOptions),
  component: NewPresetPage,
})

function NewPresetPage() {
  const { t } = useTranslation()
  const organization = appRoute.useLoaderData()
  const membership = Route.useLoaderData()
  const navigate = useNavigate()
  if (organization === null) {
    return <Alert tone="info">{t('library.orgRequiredShort')}</Alert>
  }
  const canManage = canRole(membership?.role, { watermark: ['create'] })
  if (!canManage) {
    return <Alert tone="error">{t('library.cannotCreate')}</Alert>
  }
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">{t('library.newPreset')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('library.newPresetSubtitle')}</p>
      </header>
      <WatermarkDesigner
        organizationId={organization.id}
        canManage
        canManageLogos
        onSaved={() => {
          void navigate({ to: '/app/library' })
        }}
      />
    </div>
  )
}
