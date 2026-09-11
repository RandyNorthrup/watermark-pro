import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import type { WatermarkDto } from '../../../shared/api-watermark'
import { type Layer, MAX_LAYERS } from '../../editor/state'
import { cn } from '../../lib/cn'
import { watermarksQueryOptions } from '../../lib/library'
import { PresetGate } from '../presets/preset-gate'
import { Button } from '../ui/button'

interface PresetPanelProps {
  organizationId: string
  canCreate: boolean
  layers: readonly Layer[]
  activeLayerId: string | null
  onAddPreset: (preset: WatermarkDto) => void
  onNewPreset: () => void
  onSelectLayer: (layerId: string) => void
  onRemoveLayer: (layerId: string) => void
}

const selectClassName =
  'h-11 w-full rounded-xl border border-control-line bg-surface-raised px-3 text-sm text-ink shadow-xs focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:outline-none'

/** Choose saved presets and organize the watermark layers applied to this photo. */
export function PresetPanel({ organizationId, canCreate, ...props }: PresetPanelProps) {
  const { t } = useTranslation()
  const selectId = useId()
  const presets = useQuery(watermarksQueryOptions(organizationId))

  return (
    <PresetGate
      query={presets}
      emptyHint={t('editor.watermark.emptyHint')}
      emptyContent={
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-ink-muted">
            {t(canCreate ? 'editor.watermark.createHint' : 'editor.watermark.emptyReadOnly')}
          </p>
          {canCreate ? (
            <Button type="button" onClick={props.onNewPreset}>
              {t('library.newPreset')}
            </Button>
          ) : null}
        </div>
      }
    >
      {(list) => (
        <PresetPanelBody list={list} selectId={selectId} canCreate={canCreate} {...props} />
      )}
    </PresetGate>
  )
}

interface PresetPanelBodyProps extends Omit<PresetPanelProps, 'organizationId' | 'canCreate'> {
  list: WatermarkDto[]
  canCreate: boolean
  selectId: string
}

function PresetPanelBody({
  list,
  selectId,
  layers,
  activeLayerId,
  onAddPreset,
  onNewPreset,
  canCreate,
  onSelectLayer,
  onRemoveLayer,
}: PresetPanelBodyProps) {
  const { t } = useTranslation()
  const active = layers.find((layer) => layer.id === activeLayerId)
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
            if (chosen !== undefined) onAddPreset(chosen)
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
                    onClick={() => onSelectLayer(layer.id)}
                    className={cn(
                      'flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-3 text-start text-sm transition-colors',
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
                    onClick={() => onRemoveLayer(layer.id)}
                  >
                    <X aria-hidden="true" className="size-4" />
                  </Button>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
