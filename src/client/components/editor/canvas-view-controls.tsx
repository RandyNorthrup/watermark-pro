import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  CANVAS_ZOOM_STEP_PERCENT,
  MAX_CANVAS_GRID_SPACING_PX,
  MAX_CANVAS_ZOOM_PERCENT,
  MIN_CANVAS_GRID_SPACING_PX,
  MIN_CANVAS_ZOOM_PERCENT,
  CANVAS_GRID_SPACING_STEP_PX,
} from '../../../shared/constants'
import { Button } from '../ui/button'
import { SliderField } from '../ui/slider-field'
import { Switch } from '../ui/switch'

interface CanvasViewControlsProps {
  status: string
  zoom: number
  isFit: boolean
  isGridVisible: boolean
  gridSpacing: number
  onZoomChange: (zoom: number) => void
  onFit: () => void
  onActualSize: () => void
  onGridVisibilityChange: (isVisible: boolean) => void
  onGridSpacingChange: (spacing: number) => void
}

/** Photoshop-style canvas view controls. They affect only the editor view, never exported pixels. */
export function CanvasViewControls({
  status,
  zoom,
  isFit,
  isGridVisible,
  gridSpacing,
  onZoomChange,
  onFit,
  onActualSize,
  onGridVisibilityChange,
  onGridSpacingChange,
}: CanvasViewControlsProps) {
  const { t } = useTranslation()
  const changeZoom = (next: number) =>
    onZoomChange(Math.max(MIN_CANVAS_ZOOM_PERCENT, Math.min(MAX_CANVAS_ZOOM_PERCENT, next)))

  return (
    <div
      role="group"
      aria-label={t('editor.view.label')}
      className="glass-control flex flex-wrap items-end gap-3 rounded-xl border p-3"
    >
      <p
        className="min-w-[min(100%,14rem)] flex-1 self-center truncate text-sm text-ink-muted"
        aria-live="polite"
      >
        {status}
      </p>
      <div className="flex min-w-[min(100%,22rem)] flex-1 items-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('editor.view.zoomOut')}
          onClick={() => changeZoom(zoom - CANVAS_ZOOM_STEP_PERCENT)}
        >
          <ZoomOut aria-hidden="true" className="size-4" />
        </Button>
        <SliderField
          className="min-w-32 flex-1"
          label={t('editor.view.zoom')}
          value={zoom}
          min={MIN_CANVAS_ZOOM_PERCENT}
          max={MAX_CANVAS_ZOOM_PERCENT}
          step={CANVAS_ZOOM_STEP_PERCENT}
          format={(value) => `${String(Math.round(value))}%`}
          onChange={changeZoom}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('editor.view.zoomIn')}
          onClick={() => changeZoom(zoom + CANVAS_ZOOM_STEP_PERCENT)}
        >
          <ZoomIn aria-hidden="true" className="size-4" />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" variant="secondary" size="sm" aria-pressed={isFit} onClick={onFit}>
          <Maximize2 aria-hidden="true" className="size-4" />
          {t('editor.view.fit')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          aria-pressed={!isFit && zoom === 100}
          onClick={onActualSize}
        >
          {t('editor.view.actualSize')}
        </Button>
      </div>
      <div className="flex min-w-[min(100%,18rem)] flex-1 items-end gap-3">
        <div className="flex min-h-11 items-center gap-2">
          <span className="text-sm font-medium">{t('editor.view.grid')}</span>
          <Switch
            aria-label={t('editor.view.grid')}
            isChecked={isGridVisible}
            onCheckedChange={onGridVisibilityChange}
          />
        </div>
        <SliderField
          className="min-w-32 flex-1"
          label={t('editor.view.gridSpacing')}
          value={gridSpacing}
          min={MIN_CANVAS_GRID_SPACING_PX}
          max={MAX_CANVAS_GRID_SPACING_PX}
          step={CANVAS_GRID_SPACING_STEP_PX}
          disabled={!isGridVisible}
          format={(value) => `${String(Math.round(value))} px`}
          onChange={onGridSpacingChange}
        />
      </div>
    </div>
  )
}
