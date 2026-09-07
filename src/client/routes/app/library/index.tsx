import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, getRouteApi, Link } from '@tanstack/react-router'
import { Image, PencilRuler, Plus, QrCode, Shapes, Stamp, Trash2, Type } from 'lucide-react'

import type { WatermarkDto } from '../../../../shared/api'
import type { Shape, WatermarkSpec } from '../../../../shared/watermark'
import { Alert } from '../../../components/ui/alert'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import { buttonVariants } from '../../../components/ui/button-variants'
import { Card } from '../../../components/ui/card'
import { Spinner } from '../../../components/ui/spinner'
import { describeError } from '../../../lib/errors'
import { deleteWatermark, libraryQueryKey, watermarksQueryOptions } from '../../../lib/library'
import { activeMemberRoleQueryOptions } from '../../../lib/queries'
import { canRole } from '../../../lib/roles'

const appRoute = getRouteApi('/app')

export const Route = createFileRoute('/app/library/')({
  loader: async ({ context }) => await context.queryClient.query(activeMemberRoleQueryOptions),
  component: LibraryPage,
})

const KIND_ICONS = { text: Type, symbol: Stamp, shape: Shapes, image: Image, qr: QrCode } as const

const SHAPE_LABELS: Record<Shape, string> = {
  rectangle: 'Rectangle',
  'rounded-rectangle': 'Rounded rectangle',
  ellipse: 'Ellipse',
  line: 'Line',
}

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

function describeSpec(spec: WatermarkSpec): string {
  switch (spec.kind) {
    case 'text': {
      return `“${spec.text}” in ${spec.fontFamily}`
    }
    case 'symbol': {
      return spec.symbol.type === 'glyph'
        ? `Glyph ${spec.symbol.glyph}`
        : `Icon ${spec.symbol.name}`
    }
    case 'shape': {
      return SHAPE_LABELS[spec.shape]
    }
    case 'image': {
      return 'Logo'
    }
    case 'qr': {
      return `QR code for ${spec.content}`
    }
  }
}

function describePlacement(spec: WatermarkSpec): string {
  switch (spec.placement.mode) {
    case 'smart': {
      return 'Smart placement'
    }
    case 'anchor': {
      return spec.placement.anchor.replaceAll('-', ' ')
    }
    case 'custom': {
      return 'Custom position'
    }
    case 'random': {
      return 'Random placement'
    }
  }
}

function LibraryPage() {
  const organization = appRoute.useLoaderData()
  const membership = Route.useLoaderData()
  const organizationId = organization?.id ?? ''
  const presets = useQuery({
    ...watermarksQueryOptions(organizationId),
    enabled: organizationId !== '',
  })
  if (organization === null) {
    return <Alert tone="info">Create or join an organization to build a watermark library.</Alert>
  }
  const canManage = canRole(membership?.role, { watermark: ['create'] })

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Watermark library</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Presets shared by everyone in {organization.name}. Apply them one at a time or in bulk.
          </p>
        </div>
        {canManage ? (
          <Link to="/app/library/new" className={buttonVariants({ variant: 'primary' })}>
            <Plus aria-hidden="true" className="size-4" />
            New preset
          </Link>
        ) : null}
      </header>
      <PresetList query={presets} organizationId={organization.id} canManage={canManage} />
    </div>
  )
}

interface PresetListProps {
  query: ReturnType<typeof useQuery<WatermarkDto[]>>
  organizationId: string
  canManage: boolean
}

function PresetList({ query, organizationId, canManage }: PresetListProps) {
  if (query.isPending) {
    return <Spinner className="size-6" label="Loading presets" />
  }
  if (query.isError) {
    return (
      <Alert tone="error" title="Could not load the library">
        {describeError(query.error)}
      </Alert>
    )
  }
  if (query.data.length === 0) {
    return (
      <Card className="flex flex-col items-start gap-3">
        <p className="text-sm text-ink-muted">
          No presets yet. A preset combines a mark (text, symbol or logo) with placement, contrast
          and style settings.
        </p>
        {canManage ? (
          <Link to="/app/library/new" className={buttonVariants({ variant: 'secondary' })}>
            Create the first preset
          </Link>
        ) : null}
      </Card>
    )
  }
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {query.data.map((preset) => (
        <PresetCard
          key={preset.id}
          preset={preset}
          organizationId={organizationId}
          canManage={canManage}
        />
      ))}
    </ul>
  )
}

interface PresetCardProps {
  preset: WatermarkDto
  organizationId: string
  canManage: boolean
}

function PresetCard({ preset, organizationId, canManage }: PresetCardProps) {
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: () => deleteWatermark(organizationId, preset.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: libraryQueryKey(organizationId) })
    },
  })
  const Icon = KIND_ICONS[preset.spec.kind]
  return (
    <li>
      <Card className="flex h-full flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
              <Icon aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold">
                <Link
                  to="/app/library/$watermarkId"
                  params={{ watermarkId: preset.id }}
                  className="block truncate hover:underline"
                >
                  {preset.name}
                </Link>
              </h2>
              <p className="truncate text-sm text-ink-muted">{describeSpec(preset.spec)}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Link
              to="/app/editor"
              search={{ preset: preset.id }}
              aria-label={`Open ${preset.name} in the editor`}
              className={buttonVariants({ variant: 'ghost', size: 'icon' })}
            >
              <PencilRuler aria-hidden="true" className="size-4" />
            </Link>
            {canManage ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Delete ${preset.name}`}
                disabled={remove.isPending}
                onClick={() => {
                  remove.mutate()
                }}
                className="text-ink-muted hover:text-rose-600"
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </Button>
            ) : null}
          </div>
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          <Badge>{preset.spec.kind === 'image' ? 'logo' : preset.spec.kind}</Badge>
          <span className="capitalize">{describePlacement(preset.spec)}</span>
          <span aria-hidden="true">·</span>
          <span>{preset.spec.contrast.mode === 'auto' ? 'Auto contrast' : 'Manual contrast'}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={preset.updatedAt}>
            Updated {dateFormatter.format(new Date(preset.updatedAt))}
          </time>
        </div>
        {remove.isError ? <Alert tone="error">{describeError(remove.error)}</Alert> : null}
      </Card>
    </li>
  )
}
