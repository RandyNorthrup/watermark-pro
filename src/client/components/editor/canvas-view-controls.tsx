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
  zoom: number
  isFit: boolean
  isGridVisible: boolean
  isSnappingToGrid: boolean
  gridSpacing: number
  onZoomChange: (zoom: number) => void
  onFit: () => void
  onActualSize: () => void
  onGridVisibilityChange: (isVisible: boolean) => void
  onGridSnapChange: (isEnabled: boolean) => void
  onGridSpacingChange: (spacing: number) => void
}

/** Photoshop-style canvas view controls. They affect only the editor view, never exported pixels. */
export function CanvasViewControls({
  zoom,
  isFit,
  isGridVisible,
  isSnappingToGrid,
  gridSpacing,
  onZoomChange,
  onFit,
  onActualSize,
  onGridVisibilityChange,
  onGridSnapChange,
  onGridSpacingChange,
}: CanvasViewControlsProps) {
  const { t } = useTranslation()
  const changeZoom = (next: number) =>
    onZoomChange(Math.max(MIN_CANVAS_ZOOM_PERCENT, Math.min(MAX_CANVAS_ZOOM_PERCENT, next)))

  return (
    <div
      role="group"
      aria-label={t('editor.view.label')}
      className="glass-control mx-auto flex w-full max-w-3xl flex-wrap items-center justify-center gap-x-4 gap-y-3 rounded-xl border px-3 py-2"
    >
      <div className="flex w-36 max-w-full min-w-0 grow items-end gap-1 sm:w-52 sm:grow-0">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('editor.view.zoomOut')}
          className="hidden xl:inline-flex"
          onClick={() => changeZoom(zoom - CANVAS_ZOOM_STEP_PERCENT)}
        >
          <ZoomOut aria-hidden="true" className="size-4" />
        </Button>
        <SliderField
          className="min-w-0 flex-1"
          label={t('editor.view.zoom')}
          value={Math.round(zoom)}
          min={MIN_CANVAS_ZOOM_PERCENT}
          max={MAX_CANVAS_ZOOM_PERCENT}
          step={1}
          format={(value) => `${String(Math.round(value))}%`}
          onChange={changeZoom}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('editor.view.zoomIn')}
          className="hidden xl:inline-flex"
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
      <div className="grid w-64 max-w-full min-w-0 grow grid-cols-2 items-center gap-3 sm:grow-0">
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2 text-xs font-medium">
            <span>{t('editor.view.grid')}</span>
            <Switch
              aria-label={t('editor.view.grid')}
              isChecked={isGridVisible}
              onCheckedChange={onGridVisibilityChange}
            />
          </div>
          <div className="flex items-center justify-between gap-2 text-xs font-medium">
            <span>{t('editor.view.snapToGrid')}</span>
            <Switch
              aria-label={t('editor.view.snapToGrid')}
              isChecked={isSnappingToGrid}
              onCheckedChange={onGridSnapChange}
            />
          </div>
        </div>
        <SliderField
          className="min-w-0"
          label={t('editor.view.gridSpacing')}
          value={gridSpacing}
          min={MIN_CANVAS_GRID_SPACING_PX}
          max={MAX_CANVAS_GRID_SPACING_PX}
          step={CANVAS_GRID_SPACING_STEP_PX}
          disabled={!isGridVisible && !isSnappingToGrid}
          format={(value) => `${String(Math.round(value))} px`}
          onChange={onGridSpacingChange}
        />
      </div>
    </div>
  )
}
