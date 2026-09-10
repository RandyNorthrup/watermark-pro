import { useQuery } from '@tanstack/react-query'
import { createFileRoute, getRouteApi, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { WatermarkDesigner } from '../../../components/designer/watermark-designer'
import { Alert } from '../../../components/ui/alert'
import { Spinner } from '../../../components/ui/spinner'
import { describeError } from '../../../lib/errors'
import { watermarksQueryOptions } from '../../../lib/library'
import { currentOfflineUser } from '../../../lib/offline-context'
import { readActiveMemberRole } from '../../../lib/queries'
import { noteRecentWork } from '../../../lib/recent-work-events'
import { canRole } from '../../../lib/roles'

const appRoute = getRouteApi('/app')

export const Route = createFileRoute('/app/library/$watermarkId')({
  loader: async ({ context }) => await readActiveMemberRole(context.queryClient),
  component: EditPresetPage,
})

function EditPresetPage() {
  const { t } = useTranslation()
  const organization = appRoute.useLoaderData()
  const membership = Route.useLoaderData()
  const { watermarkId } = Route.useParams()
  const navigate = useNavigate()
  const organizationId = organization?.id ?? ''
  const presets = useQuery({
    ...watermarksQueryOptions(organizationId),
    enabled: organizationId !== '',
  })
  const preset = presets.data?.find((candidate) => candidate.id === watermarkId)
  const recorded = useRef('')
  useEffect(() => {
    if (preset === undefined) return
    const key = JSON.stringify([currentOfflineUser(), organizationId, preset.id])
    if (recorded.current === key) return
    recorded.current = key
    noteRecentWork(organizationId, { kind: 'preset', preset })
  }, [organizationId, preset])

  if (organization === null) {
    return <Alert tone="info">{t('library.orgRequiredShort')}</Alert>
  }
  if (presets.isPending) {
    return <Spinner className="size-6" label={t('library.loadingPreset')} />
  }
  if (presets.isError) {
    return (
      <Alert tone="error" title={t('library.loadPresetErrorTitle')}>
        {describeError(presets.error)}
      </Alert>
    )
  }
  if (preset === undefined) {
    return <Alert tone="error">{t('library.presetGone')}</Alert>
  }
  const canManage = canRole(membership?.role, { watermark: ['update'] })
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">{preset.name}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {t(canManage ? 'library.editSubtitleManage' : 'library.editSubtitleReadOnly')}
        </p>
      </header>
      <WatermarkDesigner
        key={preset.id}
        organizationId={organization.id}
        initial={preset}
        canManage={canManage}
        canManageLogos={canRole(membership?.role, { watermark: ['create'] })}
        onSaved={() => {
          void navigate({ to: '/app/library' })
        }}
      />
    </div>
  )
}
