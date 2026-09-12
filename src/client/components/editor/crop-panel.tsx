import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import {
  ASPECT_PRESETS,
  clampCrop,
  cropForRatio,
  type CropRect,
  fullCrop,
  resolveRatio,
} from '../../editor/geometry'
import type { Size } from '../../engine/layout'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

interface CropPanelProps {
  source: Size
  crop: CropRect | null
  aspectId: string
  onAspectChange: (aspectId: string) => void
  onCropChange: (crop: CropRect | null) => void
}

type Edge = keyof CropRect

const EDGE_LABELS = {
  x: 'editor.dimensions.left',
  y: 'editor.dimensions.top',
  width: 'editor.dimensions.width',
  height: 'editor.dimensions.height',
} as const satisfies Record<Edge, string>

/** Aspect presets and numeric fields for the crop; the overlay handles pointer work. */
export function CropPanel({
  source,
  crop,
  aspectId,
  onAspectChange,
  onCropChange,
}: CropPanelProps) {
  const { t } = useTranslation()
  const fieldId = useId()
  const current = crop ?? fullCrop(source)
  const preset = ASPECT_PRESETS.find((candidate) => candidate.id === aspectId)

  function setEdge(edge: Edge, value: number) {
    if (!Number.isFinite(value)) {
      return
    }
    const next = clampCrop({ ...current, [edge]: value }, source)
    const ratio = preset === undefined ? null : resolveRatio(preset, source)
    onCropChange(ratio === null ? next : cropForRatio(source, ratio, next))
  }

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{t('editor.crop.aspectRatio')}</legend>
        <div className="flex flex-wrap gap-1.5">
          {ASPECT_PRESETS.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              aria-pressed={candidate.id === aspectId}
              onClick={() => {
                onAspectChange(candidate.id)
                const ratio = resolveRatio(candidate, source)
                onCropChange(ratio === null ? current : cropForRatio(source, ratio, current))
              }}
              className="rounded-md border border-line bg-surface-raised px-2.5 py-1 text-xs font-medium hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:outline-none aria-pressed:border-brand-500 aria-pressed:bg-brand-600 aria-pressed:text-white dark:hover:bg-brand-900/40"
            >
              {candidate.label}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        {(Object.keys(EDGE_LABELS) as Edge[]).map((edge) => (
          <div key={edge} className="flex flex-col gap-1">
            <label htmlFor={`${fieldId}-${edge}`} className="text-xs font-medium text-ink-muted">
              {t('editor.dimensions.pxField', { label: t(EDGE_LABELS[edge]) })}
            </label>
            <Input
              id={`${fieldId}-${edge}`}
              type="number"
              inputMode="numeric"
              min={0}
              max={edge === 'x' || edge === 'width' ? source.width : source.height}
              value={current[edge]}
              onChange={(event) => {
                setEdge(edge, Number(event.currentTarget.value))
              }}
            />
          </div>
        ))}
      </div>
      <p className="text-xs text-ink-muted">
        {t('editor.crop.photoSize', { width: source.width, height: source.height })}
      </p>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="self-center"
        disabled={crop === null}
        onClick={() => {
          onAspectChange('free')
          onCropChange(null)
        }}
      >
        {t('editor.crop.reset')}
      </Button>
    </div>
  )
}
