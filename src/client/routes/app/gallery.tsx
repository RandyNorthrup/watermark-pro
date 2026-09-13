import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { folderSearchSchema } from '../../../shared/client-search'
import { FolderBrowser } from '../../components/folders/folder-browser'
import { Gallery } from '../../components/gallery/gallery'
import { RecentWork } from '../../components/recent-work/recent-work'
import { Alert } from '../../components/ui/alert'
import { useActiveOrganization } from '../../lib/active-organization'
import { readActiveMemberRole } from '../../lib/queries'
import { canRole } from '../../lib/roles'

export const Route = createFileRoute('/app/gallery')({
  validateSearch: folderSearchSchema,
  loader: async ({ context }) => await readActiveMemberRole(context.queryClient),
  component: GalleryPage,
})

function GalleryPage() {
  const { t } = useTranslation()
  const organization = useActiveOrganization()
  const membership = Route.useLoaderData()
  const { folderId } = Route.useSearch()
  const navigate = Route.useNavigate()
  if (organization === null) {
    return <Alert tone="info">{t('gallery.orgRequired')}</Alert>
  }
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">{t('gallery.heading')}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {t('gallery.description', { name: organization.name })}
        </p>
      </header>
      <RecentWork
        organizationId={organization.id}
        organizationName={organization.name}
        role={membership?.role}
        kind="photo"
      />
      <FolderBrowser
        key={organization.id}
        organizationId={organization.id}
        kind="photo"
        folderId={folderId ?? null}
        canManage={canRole(membership?.role, { photo: ['upload'] })}
        onNavigate={async (next) => {
          await navigate({ search: { folderId: next ?? undefined } })
        }}
      />
      <section aria-label={t('gallery.heading')}>
        <Gallery
          key={`${organization.id}-${folderId ?? 'root'}`}
          organizationId={organization.id}
          role={membership?.role}
          folderId={folderId ?? null}
        />
      </section>
    </div>
  )
}
