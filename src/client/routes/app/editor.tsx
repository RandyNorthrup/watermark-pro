import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { z } from 'zod'

import { Editor } from '../../components/editor/editor'
import { Alert } from '../../components/ui/alert'

const appRoute = getRouteApi('/app')

const editorSearchSchema = z.object({
  /** Library preset to load on open. */
  preset: z.string().min(1).optional(),
})

export const Route = createFileRoute('/app/editor')({
  validateSearch: editorSearchSchema,
  component: EditorPage,
})

function EditorPage() {
  const organization = appRoute.useLoaderData()
  const { preset } = Route.useSearch()
  if (organization === null) {
    return <Alert tone="info">Create or join an organization to use the editor.</Alert>
  }
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Editor</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Watermark one photo: pick a preset, place it by hand if you like, crop, resize and
          download. Nothing leaves your browser.
        </p>
      </header>
      <Editor organizationId={organization.id} initialPresetId={preset ?? null} />
    </div>
  )
}
