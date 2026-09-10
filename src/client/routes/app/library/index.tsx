import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, getRouteApi, Link } from '@tanstack/react-router'
import type { TFunction } from 'i18next'
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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { AssetDto } from '../../../../shared/api'
import type { WatermarkDto } from '../../../../shared/api-watermark'
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
import { loadWorkspaceMedia } from '../../../lib/offline-media'
import { buildPresetFile, type ExportLogo } from '../../../lib/preset-file'
import { readActiveMemberRole } from '../../../lib/queries'
import { canRole } from '../../../lib/roles'

const appRoute = getRouteApi('/app')

export const Route = createFileRoute('/app/library/')({
  loader: async ({ context }) => await readActiveMemberRole(context.queryClient),
  component: LibraryPage,
})

const KIND_ICONS = { text: Type, symbol: Stamp, shape: Shapes, image: Image, qr: QrCode } as const

/** Catalogue keys for each shape; translated where a preset is described. */
const SHAPE_LABELS = {
  rectangle: 'library.shape.rectangle',
  'rounded-rectangle': 'library.shape.roundedRectangle',
  ellipse: 'library.shape.ellipse',
  line: 'library.shape.line',
} as const satisfies Record<Shape, string>

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

/** Characters of an ISO timestamp that make up the `YYYY-MM-DD` date stamp. */
const DATE_STAMP_LENGTH = 10
/** The exported bundle is pretty-printed with this indent for readability. */
const EXPORT_INDENT = 2

function describeSpec(t: TFunction, spec: WatermarkSpec): string {
  switch (spec.kind) {
    case 'text': {
      return t('library.describe.text', { text: spec.text, fontFamily: spec.fontFamily })
    }
    case 'symbol': {
      if (spec.symbol.type === 'sticker')
        return t('library.describe.sticker', { name: spec.symbol.id })
      return spec.symbol.type === 'glyph'
        ? t('library.describe.glyph', { glyph: spec.symbol.glyph })
        : t('library.describe.icon', { name: spec.symbol.name })
    }
    case 'shape': {
      return t(SHAPE_LABELS[spec.shape])
    }
    case 'image': {
      return t('library.describe.logo')
    }
    case 'qr': {
      return t('library.describe.qr', { content: spec.content })
    }
  }
}

function describePlacement(t: TFunction, spec: WatermarkSpec): string {
  switch (spec.placement.mode) {
    case 'smart': {
      return t('library.placement.smart')
    }
    case 'anchor': {
      return spec.placement.anchor.replaceAll('-', ' ')
    }
    case 'custom': {
      return t('library.placement.custom')
    }
    case 'random': {
      return t('library.placement.random')
    }
  }
}

/** Narrows a stored asset content type to the logo types the bundle allows. */
function toLogoContentType(t: TFunction, value: string): (typeof LOGO_CONTENT_TYPES)[number] {
  const match = LOGO_CONTENT_TYPES.find((type) => type === value)
  if (match === undefined) {
    throw new Error(t('library.exportLogoTypeError'))
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
  t: TFunction,
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
      throw new Error(t('library.exportMissingLogoError'))
    }
    const blob = await loadWorkspaceMedia(organizationId, assetFileUrl(organizationId, assetId))
    const bytes = new Uint8Array(await blob.arrayBuffer())
    logos.push({
      assetId,
      name: asset.name,
      contentType: toLogoContentType(t, asset.contentType),
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
  const { t } = useTranslation()
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
      const blob = await buildExportBlob(t, organizationId, chosen, assets)
      downloadBlob(blob, exportFileName(organization))
    },
  })
  if (organization === null) {
    return <Alert tone="info">{t('library.orgRequired')}</Alert>
  }
  const canManage = canRole(membership?.role, { watermark: ['create'] })
  const items = presets.data ?? []

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t('library.heading')}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {t('library.description', { name: organization.name })}
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
              {t('library.export')}
            </Button>
          ) : null}
          {canManage ? (
            <Link
              to="/app/library/new"
              search={{ kind: 'qr' }}
              className={buttonVariants({ variant: 'secondary' })}
            >
              <QrCode aria-hidden="true" className="size-4" />
              {t('library.newQr')}
            </Link>
          ) : null}
          {canManage ? (
            <ImportDialog
              organizationId={organization.id}
              existingNames={items.map((preset) => preset.name)}
              trigger={
                <Button type="button" variant="secondary">
                  <Upload aria-hidden="true" className="size-4" />
                  {t('library.importPresets')}
                </Button>
              }
            />
          ) : null}
          {canManage ? (
            <Link to="/app/library/new" className={buttonVariants({ variant: 'primary' })}>
              <Plus aria-hidden="true" className="size-4" />
              {t('library.newPreset')}
            </Link>
          ) : null}
        </div>
      </header>
      {exportPresets.isError ? (
        <Alert tone="error" title={t('library.exportErrorTitle')}>
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
  const { t } = useTranslation()
  const [qrOnly, setQrOnly] = useState(false)
  if (query.isPending) {
    return <Spinner className="size-6" label={t('library.loadingPresets')} />
  }
  if (query.isError) {
    return (
      <Alert tone="error" title={t('library.loadErrorTitle')}>
        {describeError(query.error)}
      </Alert>
    )
  }
  if (query.data.length === 0) {
    return (
      <Card className="flex flex-col items-start gap-3">
        <p className="text-sm text-ink-muted">{t('library.empty')}</p>
        {canManage ? (
          <Link to="/app/library/new" className={buttonVariants({ variant: 'secondary' })}>
            {t('library.createFirst')}
          </Link>
        ) : null}
      </Card>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <label className="flex min-h-11 items-center gap-2 self-start text-sm">
        <input
          type="checkbox"
          checked={qrOnly}
          onChange={(event) => setQrOnly(event.currentTarget.checked)}
          className="size-4 accent-brand-600"
        />
        {t('library.qrOnly')}
      </label>
      {qrOnly && query.data.every((preset) => preset.spec.kind !== 'qr') ? (
        <p className="text-sm text-ink-muted">{t('library.noQr')}</p>
      ) : null}
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {query.data
          .filter((preset) => !qrOnly || preset.spec.kind === 'qr')
          .map((preset) => (
            <PresetCard
              key={preset.id}
              preset={preset}
              organizationId={organizationId}
              canManage={canManage}
              onExport={onExport}
            />
          ))}
      </ul>
    </div>
  )
}

interface PresetCardProps {
  preset: WatermarkDto
  organizationId: string
  canManage: boolean
  onExport: (preset: WatermarkDto) => void
}

function PresetCard({ preset, organizationId, canManage, onExport }: PresetCardProps) {
  const { t } = useTranslation()
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
            <p className="truncate text-sm text-ink-muted">{describeSpec(t, preset.spec)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('library.exportPreset', { name: preset.name })}
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
            aria-label={t('library.openInEditor', { name: preset.name })}
            className={buttonVariants({ variant: 'ghost', size: 'icon' })}
          >
            <PencilRuler aria-hidden="true" className="size-4" />
          </Link>
          {canManage ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('library.deletePreset', { name: preset.name })}
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
          <Badge>{preset.spec.kind === 'image' ? t('library.logoBadge') : preset.spec.kind}</Badge>
          <span className="capitalize">{describePlacement(t, preset.spec)}</span>
          <span aria-hidden="true">·</span>
          <span>
            {t(
              preset.spec.contrast.mode === 'auto'
                ? 'library.autoContrast'
                : 'library.manualContrast',
            )}
          </span>
          <span aria-hidden="true">·</span>
          <time dateTime={preset.updatedAt}>
            {t('library.updated', { date: dateFormatter.format(new Date(preset.updatedAt)) })}
          </time>
        </div>
        {remove.isError ? <Alert tone="error">{describeError(remove.error)}</Alert> : null}
      </Card>
    </li>
  )
}
