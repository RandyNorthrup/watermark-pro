import { createFileRoute, getRouteApi } from '@tanstack/react-router'

import { BulkTool } from '../../components/bulk/bulk-tool'
import { Alert } from '../../components/ui/alert'

const appRoute = getRouteApi('/app')

export const Route = createFileRoute('/app/bulk')({
  component: BulkPage,
})

function BulkPage() {
  const organization = appRoute.useLoaderData()
  if (organization === null) {
    return <Alert tone="info">Create or join an organization to watermark in bulk.</Alert>
  }
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Bulk watermarking</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Apply one preset to a whole shoot. Photos are processed in parallel in your browser and
          downloaded as a ZIP or one by one.
        </p>
      </header>
      <BulkTool organizationId={organization.id} />
    </div>
  )
}
