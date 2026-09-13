import { type CSSProperties, type ReactNode, useState } from 'react'

import { CanvasViewControls } from './canvas-view-controls'
import { useCanvasGestures } from './use-canvas-gestures'
import {
  CANVAS_FIT_PADDING_PX,
  DEFAULT_CANVAS_GRID_SPACING_PX,
  DEFAULT_CANVAS_ZOOM_PERCENT,
} from '../../../shared/constants'
import type { Size } from '../../engine/layout'
import { useElementSize } from '../../lib/use-element-size'

interface ViewGeometry {
  displaySize: Size
  gridSpacing: number | undefined
}

/** Shared document/video viewport; zoom and grid change the view without resampling exports. */
export function MediaViewport({
  size,
  children,
  isReady = true,
}: {
  size: Size
  children: (geometry: ViewGeometry) => ReactNode
  isReady?: boolean
}) {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null)
  const viewportSize = useElementSize(viewport)
  const [zoom, setZoom] = useState<number | null>(null)
  const [grid, setGrid] = useState(false)
  const [snap, setSnap] = useState(false)
  const [spacing, setSpacing] = useState(DEFAULT_CANVAS_GRID_SPACING_PX)
  const available = {
    width: Math.max(1, viewportSize.width - CANVAS_FIT_PADDING_PX * 2),
    height: Math.max(1, viewportSize.height - CANVAS_FIT_PADDING_PX * 2),
  }
  const fit = Math.min(available.width / size.width, available.height / size.height) * 100
  const scale = isReady ? (zoom ?? Math.max(1, fit)) : DEFAULT_CANVAS_ZOOM_PERCENT
  const gestures = useCanvasGestures(viewport, scale, setZoom)
  const displaySize = { width: (size.width * scale) / 100, height: (size.height * scale) / 100 }
  const gridStyle: CSSProperties & { '--canvas-grid-spacing': string } = {
    '--canvas-grid-spacing': `${String((spacing * scale) / 100)}px`,
  }
  return (
    <>
      <div
        ref={setViewport}
        {...(isReady ? gestures : {})}
        className="app-scroll-region h-[54svh] min-h-64 touch-none overflow-auto overscroll-contain rounded-xl border border-line bg-surface-raised lg:h-[calc(100svh-19rem)]"
      >
        <div className="grid min-h-full w-max min-w-full place-items-center">
          <div data-canvas-content="" className="relative shrink-0" style={displaySize}>
            {children({ displaySize, gridSpacing: snap ? (spacing * scale) / 100 : undefined })}
            {grid && isReady ? (
              <div
                aria-hidden="true"
                className="canvas-grid-overlay pointer-events-none absolute inset-0"
                style={gridStyle}
              />
            ) : null}
          </div>
        </div>
      </div>
      {isReady ? (
        <CanvasViewControls
          zoom={scale}
          isFit={zoom === null}
          isGridVisible={grid}
          isSnappingToGrid={snap}
          gridSpacing={spacing}
          onZoomChange={setZoom}
          onFit={() => setZoom(null)}
          onActualSize={() => setZoom(DEFAULT_CANVAS_ZOOM_PERCENT)}
          onGridVisibilityChange={setGrid}
          onGridSnapChange={(value) => {
            setSnap(value)
            if (value) setGrid(true)
          }}
          onGridSpacingChange={setSpacing}
        />
      ) : null}
    </>
  )
}
