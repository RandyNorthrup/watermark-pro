import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Gallery } from '../../components/gallery/gallery'
import { Alert } from '../../components/ui/alert'
import { readActiveMemberRole } from '../../lib/queries'

const appRoute = getRouteApi('/app')

export const Route = createFileRoute('/app/gallery')({
  loader: async ({ context }) => await readActiveMemberRole(context.queryClient),
  component: GalleryPage,
})

function GalleryPage() {
  const { t } = useTranslation()
  const organization = appRoute.useLoaderData()
  const membership = Route.useLoaderData()
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
      <Gallery organizationId={organization.id} role={membership?.role} />
    </div>
  )
}
