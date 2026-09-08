import { createFileRoute, getRouteApi } from '@tanstack/react-router'

import { DocumentsTool } from '../../components/documents/documents-tool'
import { Alert } from '../../components/ui/alert'

const appRoute = getRouteApi('/app')

export const Route = createFileRoute('/app/documents')({
  component: DocumentsPage,
})

function DocumentsPage() {
  const organization = appRoute.useLoaderData()
  if (organization === null) {
    return <Alert tone="info">Create or join an organization to watermark documents.</Alert>
  }
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Documents</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Stamp a preset onto every page of a PDF. Files are processed in your browser and
          downloaded one by one or as a ZIP.
        </p>
      </header>
      <DocumentsTool organizationId={organization.id} />
    </div>
  )
}
