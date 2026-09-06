import { useQuery } from '@tanstack/react-query'
import { createFileRoute, getRouteApi, useNavigate } from '@tanstack/react-router'

import { WatermarkDesigner } from '../../../components/designer/watermark-designer'
import { Alert } from '../../../components/ui/alert'
import { Spinner } from '../../../components/ui/spinner'
import { describeError } from '../../../lib/errors'
import { watermarksQueryOptions } from '../../../lib/library'
import { activeMemberRoleQueryOptions } from '../../../lib/queries'
import { canRole } from '../../../lib/roles'

const appRoute = getRouteApi('/app')

export const Route = createFileRoute('/app/library/$watermarkId')({
  loader: async ({ context }) => await context.queryClient.query(activeMemberRoleQueryOptions),
  component: EditPresetPage,
})

function EditPresetPage() {
  const organization = appRoute.useLoaderData()
  const membership = Route.useLoaderData()
  const { watermarkId } = Route.useParams()
  const navigate = useNavigate()
  const organizationId = organization?.id ?? ''
  const presets = useQuery({
    ...watermarksQueryOptions(organizationId),
    enabled: organizationId !== '',
  })

  if (organization === null) {
    return <Alert tone="info">Create or join an organization first.</Alert>
  }
  if (presets.isPending) {
    return <Spinner className="size-6" label="Loading preset" />
  }
  if (presets.isError) {
    return (
      <Alert tone="error" title="Could not load the preset">
        {describeError(presets.error)}
      </Alert>
    )
  }
  const preset = presets.data.find((candidate) => candidate.id === watermarkId)
  if (preset === undefined) {
    return <Alert tone="error">That preset no longer exists.</Alert>
  }
  const canManage = canRole(membership?.role, { watermark: ['update'] })
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">{preset.name}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {canManage ? 'Changes apply to everyone who uses this preset.' : 'Read-only view.'}
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
