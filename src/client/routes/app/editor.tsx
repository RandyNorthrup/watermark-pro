import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { editorSearchSchema } from '../../../shared/client-search'
import { SAMPLE_SCENE_PATH } from '../../../shared/constants'
import {
  PREVIEW_GRID_CLASS,
  PREVIEW_REGION_CLASS,
  SAMPLE_PREVIEW_CLASS,
} from '../../components/editor/preview-layout'
import { SampleScene } from '../../components/sample-scene'
import { editorTool } from '../../components/tool-modules'
import { ToolSuspense } from '../../components/tool-suspense'
import { Alert } from '../../components/ui/alert'
import { useActiveOrganization } from '../../lib/active-organization'
import { readActiveMemberRole } from '../../lib/queries'
import { canRole } from '../../lib/roles'

export const Route = createFileRoute('/app/editor')({
  validateSearch: editorSearchSchema,
  staticData: { preloadImages: [SAMPLE_SCENE_PATH] },
  loader: async ({ context }) => await readActiveMemberRole(context.queryClient),
  component: EditorPage,
})

function EditorPage() {
  const { t } = useTranslation()
  const organization = useActiveOrganization()
  const membership = Route.useLoaderData()
  const { preset } = Route.useSearch()
  if (organization === null) {
    return <Alert tone="info">{t('editor.orgRequired')}</Alert>
  }
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">{t('editor.heading')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('editor.description')}</p>
      </header>
      <ToolSuspense pending={<EditorPending />}>
        <editorTool.Component
          organizationId={organization.id}
          organizationName={organization.name}
          initialPresetId={preset ?? null}
          canSave={canRole(membership?.role, { photo: ['upload'] })}
          canCreatePresets={canRole(membership?.role, { watermark: ['create'] })}
        />
      </ToolSuspense>
    </div>
  )
}

/** The editor's own first frame, the sample scene in its preview area, while the editor loads. */
function EditorPending() {
  return (
    <div className={`w-full ${PREVIEW_REGION_CLASS}`}>
      <div className={PREVIEW_GRID_CLASS}>
        <SampleScene className={SAMPLE_PREVIEW_CLASS} />
      </div>
    </div>
  )
}
