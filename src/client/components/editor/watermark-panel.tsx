import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import type { WatermarkDto } from '../../../shared/api-watermark'
import type { WatermarkSpec } from '../../../shared/watermark'
import { type Layer, MAX_LAYERS } from '../../editor/state'
import { cn } from '../../lib/cn'
import { watermarksQueryOptions } from '../../lib/library'
import { WatermarkDesigner } from '../designer/watermark-designer'
import { PresetGate } from '../presets/preset-gate'
import { Button } from '../ui/button'

interface WatermarkPanelProps {
  organizationId: string
  canCreate: boolean
  draftSpec: WatermarkSpec
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  /** Marks on the photo in drawing order. */
  layers: readonly Layer[]
  activeLayerId: string | null
  onAddPreset: (preset: WatermarkDto) => void
  onNewPreset: () => void
  onSelectLayer: (layerId: string) => void
  onRemoveLayer: (layerId: string) => void
  /** Replaces the active layer's spec. */
  onSpecChange: (spec: WatermarkSpec) => void
}

const selectClassName =
  'h-10 w-full rounded-lg border border-line bg-surface-raised px-3 text-sm text-ink shadow-xs focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:outline-none'

function isSameSpec(a: WatermarkSpec, b: WatermarkSpec): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * The marks on this photo: add library presets as layers, pick one to
 * adjust its placement and style for this photo only, remove the ones you
 * no longer want.
 */
export function WatermarkPanel({
  organizationId,
  canCreate,
  draftSpec,
  undo,
  redo,
  canUndo,
  canRedo,
  ...props
}: WatermarkPanelProps) {
  const { t } = useTranslation()
  const selectId = useId()
  const presets = useQuery(watermarksQueryOptions(organizationId))

  const active = props.layers.find((layer) => layer.id === props.activeLayerId)
  const initial = presets.data?.find((preset) => preset.id === active?.presetId)
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PresetGate
        query={presets}
        emptyHint={t('editor.watermark.emptyHint')}
        emptyContent={
          <p className="text-sm text-ink-muted">
            {t(canCreate ? 'editor.watermark.createHint' : 'editor.watermark.emptyReadOnly')}
          </p>
        }
      >
        {(list) => <PanelBody list={list} selectId={selectId} canCreate={canCreate} {...props} />}
      </PresetGate>
      {canCreate || active !== undefined ? (
        <WatermarkDesigner
          key={active?.id ?? 'draft'}
          organizationId={organizationId}
          initial={initial}
          canManage
          canSave={canCreate}
          canManageLogos={canCreate}
          submitLabel={t(
            initial === undefined ? 'editor.watermark.saveAndUse' : 'designer.saveChanges',
          )}
          inline={{
            spec: active?.spec ?? draftSpec,
            onChange: props.onSpecChange,
            undo,
            redo,
            canUndo,
            canRedo,
          }}
          onSaved={(saved) => {
            if (active === undefined) props.onAddPreset(saved)
            else props.onSpecChange(saved.spec)
          }}
        />
      ) : null}
    </div>
  )
}

interface PanelBodyProps extends Omit<
  WatermarkPanelProps,
  'organizationId' | 'canCreate' | 'draftSpec' | 'undo' | 'redo' | 'canUndo' | 'canRedo'
> {
  list: WatermarkDto[]
  canCreate: boolean
  selectId: string
}

function PanelBody({
  list,
  selectId,
  layers,
  activeLayerId,
  onAddPreset,
  onNewPreset,
  canCreate,
  onSelectLayer,
  onRemoveLayer,
  onSpecChange,
}: PanelBodyProps) {
  const { t } = useTranslation()
  const active = layers.find((layer) => layer.id === activeLayerId)
  const activePreset = list.find((candidate) => candidate.id === active?.presetId)
  const isModified =
    active !== undefined &&
    activePreset !== undefined &&
    !isSameSpec(activePreset.spec, active.spec)
  const revertTo = isModified ? activePreset : undefined
  const isFull = layers.length >= MAX_LAYERS

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={selectId} className="text-sm font-medium">
          {t(layers.length === 0 ? 'editor.watermark.preset' : 'editor.watermark.addPreset')}
        </label>
        <select
          id={selectId}
          value=""
          disabled={isFull}
          onChange={(event) => {
            const { value } = event.currentTarget
            if (value === 'draft') {
              onNewPreset()
              return
            }
            const chosen = list.find((candidate) => candidate.id === value)
            if (chosen !== undefined) {
              onAddPreset(chosen)
            }
          }}
          className={selectClassName}
        >
          <option value="" disabled>
            {isFull
              ? t('editor.watermark.maxMarks', { max: MAX_LAYERS })
              : t('editor.watermark.choosePreset')}
          </option>
          {canCreate ? <option value="draft">{t('library.newPreset')}</option> : null}
          {list.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </select>
      </div>

      {layers.length === 0 ? null : (
        <section aria-labelledby="editor-layers-heading" className="flex flex-col gap-2">
          <h2 id="editor-layers-heading" className="text-sm font-semibold">
            {t('editor.watermark.marksHeading')}
          </h2>
          <ul className="flex flex-col gap-1" aria-label={t('editor.watermark.layersLabel')}>
            {layers.map((layer, index) => {
              const preset = list.find((candidate) => candidate.id === layer.presetId)
              const name = preset?.name ?? t('editor.watermark.removedPreset')
              const isActive = layer.id === active?.id
              return (
                <li key={layer.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => {
                      onSelectLayer(layer.id)
                    }}
                    className={cn(
                      'flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg px-3 text-start text-sm transition-colors',
                      isActive
                        ? 'bg-brand-50 font-medium text-brand-800 dark:bg-brand-900/50 dark:text-brand-100'
                        : 'text-ink hover:bg-brand-50/60 dark:hover:bg-brand-900/20',
                    )}
                  >
                    <span className="w-4 shrink-0 text-xs text-ink-muted">{String(index + 1)}</span>
                    <span className="truncate">{name}</span>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t('editor.watermark.removeLayer', { name })}
                    onClick={() => {
                      onRemoveLayer(layer.id)
                    }}
                  >
                    <X aria-hidden="true" className="size-4" />
                  </Button>
                </li>
              )
            })}
          </ul>
          {isModified ? (
            <div className="flex items-center justify-between gap-2 text-xs text-ink-muted">
              <span>{t('editor.watermark.adjusted')}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (revertTo !== undefined) {
                    onSpecChange(revertTo.spec)
                  }
                }}
              >
                {t('editor.watermark.revert')}
              </Button>
            </div>
          ) : null}
        </section>
      )}
    </div>
  )
}
