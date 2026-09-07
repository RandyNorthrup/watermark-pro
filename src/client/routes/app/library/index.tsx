import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, getRouteApi, Link } from '@tanstack/react-router'
import {
  Download,
  Image,
  PencilRuler,
  Plus,
  QrCode,
  Shapes,
  Stamp,
  Trash2,
  Type,
  Upload,
} from 'lucide-react'

import type { AssetDto, WatermarkDto } from '../../../../shared/api'
import { LOGO_CONTENT_TYPES } from '../../../../shared/constants'
import type { Shape, WatermarkSpec } from '../../../../shared/watermark'
import { ImportDialog } from '../../../components/presets/import-dialog'
import { Alert } from '../../../components/ui/alert'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import { buttonVariants } from '../../../components/ui/button-variants'
import { Card } from '../../../components/ui/card'
import { Spinner } from '../../../components/ui/spinner'
import { downloadBlob } from '../../../lib/download'
import { describeError } from '../../../lib/errors'
import {
  assetFileUrl,
  assetsQueryOptions,
  deleteWatermark,
  libraryQueryKey,
  watermarksQueryOptions,
} from '../../../lib/library'
import { buildPresetFile, type ExportLogo } from '../../../lib/preset-file'
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

/** Characters of an ISO timestamp that make up the `YYYY-MM-DD` date stamp. */
const DATE_STAMP_LENGTH = 10
/** The exported bundle is pretty-printed with this indent for readability. */
const EXPORT_INDENT = 2

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

/** Narrows a stored asset content type to the logo types the bundle allows. */
function toLogoContentType(value: string): (typeof LOGO_CONTENT_TYPES)[number] {
  const match = LOGO_CONTENT_TYPES.find((type) => type === value)
  if (match === undefined) {
    throw new Error('A logo has an image type that cannot be exported.')
  }
  return match
}

/** `presets-<org>-<date>.wmp.json`; the slug when set, otherwise the id. */
function exportFileName(organization: { slug?: string | null; id: string }): string {
  const stamp = new Date().toISOString().slice(0, DATE_STAMP_LENGTH)
  return `presets-${organization.slug ?? organization.id}-${stamp}.wmp.json`
}

/**
 * Builds the portable bundle for `presets`, fetching the bytes of every logo an
 * image preset references so the file is self-contained.
 */
async function buildExportBlob(
  organizationId: string,
  presets: readonly WatermarkDto[],
  assets: readonly AssetDto[],
): Promise<Blob> {
  const assetIds = [
    ...new Set(
      presets.flatMap((preset) => (preset.spec.kind === 'image' ? [preset.spec.assetId] : [])),
    ),
  ]
  const assetById = new Map(assets.map((asset) => [asset.id, asset]))
  const logos: ExportLogo[] = []
  for (const assetId of assetIds) {
    const asset = assetById.get(assetId)
    if (asset === undefined) {
      throw new Error('A preset refers to a logo that is no longer in the library.')
    }
    const response = await fetch(assetFileUrl(organizationId, assetId))
    const bytes = new Uint8Array(await response.arrayBuffer())
    logos.push({
      assetId,
      name: asset.name,
      contentType: toLogoContentType(asset.contentType),
      width: asset.width,
      height: asset.height,
      bytes,
    })
  }
  const file = buildPresetFile(
    presets.map((preset) => ({ name: preset.name, spec: preset.spec })),
    logos,
  )
  return new Blob([JSON.stringify(file, null, EXPORT_INDENT)], { type: 'application/json' })
}

function LibraryPage() {
  const organization = appRoute.useLoaderData()
  const membership = Route.useLoaderData()
  const organizationId = organization?.id ?? ''
  const queryClient = useQueryClient()
  const presets = useQuery({
    ...watermarksQueryOptions(organizationId),
    enabled: organizationId !== '',
  })
  const exportPresets = useMutation({
    mutationFn: async (chosen: readonly WatermarkDto[]) => {
      if (organization === null) {
        return
      }
      const hasImagePresets = chosen.some((preset) => preset.spec.kind === 'image')
      const assets = hasImagePresets
        ? await queryClient.query(assetsQueryOptions(organizationId))
        : []
      const blob = await buildExportBlob(organizationId, chosen, assets)
      downloadBlob(blob, exportFileName(organization))
    },
  })
  if (organization === null) {
    return <Alert tone="info">Create or join an organization to build a watermark library.</Alert>
  }
  const canManage = canRole(membership?.role, { watermark: ['create'] })
  const items = presets.data ?? []

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Watermark library</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Presets shared by everyone in {organization.name}. Apply them one at a time or in bulk.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {items.length > 0 ? (
            <Button
              type="button"
              variant="secondary"
              isPending={exportPresets.isPending}
              onClick={() => {
                exportPresets.mutate(items)
              }}
            >
              {exportPresets.isPending ? null : <Download aria-hidden="true" className="size-4" />}
              Export
            </Button>
          ) : null}
          {canManage ? (
            <ImportDialog
              organizationId={organization.id}
              existingNames={items.map((preset) => preset.name)}
              trigger={
                <Button type="button" variant="secondary">
                  <Upload aria-hidden="true" className="size-4" />
                  Import presets
                </Button>
              }
            />
          ) : null}
          {canManage ? (
            <Link to="/app/library/new" className={buttonVariants({ variant: 'primary' })}>
              <Plus aria-hidden="true" className="size-4" />
              New preset
            </Link>
          ) : null}
        </div>
      </header>
      {exportPresets.isError ? (
        <Alert tone="error" title="Could not export the presets">
          {describeError(exportPresets.error)}
        </Alert>
      ) : null}
      <PresetList
        query={presets}
        organizationId={organization.id}
        canManage={canManage}
        onExport={(preset) => {
          exportPresets.mutate([preset])
        }}
      />
    </div>
  )
}

interface PresetListProps {
  query: ReturnType<typeof useQuery<WatermarkDto[]>>
  organizationId: string
  canManage: boolean
  onExport: (preset: WatermarkDto) => void
}

function PresetList({ query, organizationId, canManage, onExport }: PresetListProps) {
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
          onExport={onExport}
        />
      ))}
    </ul>
  )
}

interface PresetCardProps {
  preset: WatermarkDto
  organizationId: string
  canManage: boolean
  onExport: (preset: WatermarkDto) => void
}

function PresetCard({ preset, organizationId, canManage, onExport }: PresetCardProps) {
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
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
            <Icon aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
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
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Export ${preset.name}`}
            className="text-ink-muted"
            onClick={() => {
              onExport(preset)
            }}
          >
            <Download aria-hidden="true" className="size-4" />
          </Button>
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
