import { type KeyboardEvent, type PointerEvent, useRef } from 'react'

import type { GesturePhase } from './mark-overlay'
import {
  CROP_HANDLES,
  type CropHandle,
  type CropRect,
  moveCrop,
  resizeCrop,
} from '../../editor/geometry'
import type { Size } from '../../engine/layout'

export interface CropGesture {
  phase: GesturePhase
  crop?: CropRect
}

interface CropOverlayProps {
  crop: CropRect
  source: Size
  displaySize: Size
  ratio: number | null
  onGesture: (gesture: CropGesture) => void
}

interface DragState {
  pointerId: number
  handle: CropHandle | 'move'
  startX: number
  startY: number
  crop: CropRect
}

const NUDGE_FRACTION = 0.01
const NUDGE_FRACTION_LARGE = 0.05
const HANDLE_LABELS: Record<CropHandle, string> = {
  n: 'top edge',
  s: 'bottom edge',
  e: 'right edge',
  w: 'left edge',
  ne: 'top right corner',
  nw: 'top left corner',
  se: 'bottom right corner',
  sw: 'bottom left corner',
}
const HANDLE_POSITIONS: Record<CropHandle, string> = {
  n: 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize',
  s: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 cursor-ns-resize',
  e: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize',
  w: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize',
  ne: 'top-0 right-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize',
  nw: 'top-0 left-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize',
  se: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize',
  sw: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize',
}

/**
 * Crop frame over the untransformed photo: drag inside to move, the eight
 * handles to resize (honouring a locked ratio). Keyboard: arrows move the
 * frame, Shift for larger steps.
 */
export function CropOverlay({ crop, source, displaySize, ratio, onGesture }: CropOverlayProps) {
  const dragRef = useRef<DragState | null>(null)
  const k = displaySize.width / source.width
  if (!(k > 0) || !Number.isFinite(k)) {
    return null
  }

  function begin(event: PointerEvent<HTMLElement>, handle: CropHandle | 'move') {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      crop,
    }
    onGesture({ phase: 'start' })
  }

  function move(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current
    if (drag?.pointerId !== event.pointerId) {
      return
    }
    const dx = (event.clientX - drag.startX) / k
    const dy = (event.clientY - drag.startY) / k
    const next =
      drag.handle === 'move'
        ? moveCrop(drag.crop, dx, dy, source)
        : resizeCrop(drag.crop, drag.handle, dx, dy, ratio, source)
    onGesture({ phase: 'move', crop: next })
  }

  function end(event: PointerEvent<HTMLElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) {
      return
    }
    dragRef.current = null
    onGesture({ phase: 'end' })
  }

  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    const fraction = event.shiftKey ? NUDGE_FRACTION_LARGE : NUDGE_FRACTION
    const stepX = source.width * fraction
    const stepY = source.height * fraction
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-stepX, 0],
      ArrowRight: [stepX, 0],
      ArrowUp: [0, -stepY],
      ArrowDown: [0, stepY],
    }
    const delta = moves[event.key]
    if (delta === undefined) {
      return
    }
    event.preventDefault()
    onGesture({ phase: 'commit', crop: moveCrop(crop, delta[0], delta[1], source) })
  }

  const left = crop.x * k
  const top = crop.y * k
  const width = crop.width * k
  const height = crop.height * k

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/50"
        style={{
          clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${String(left)}px ${String(top)}px, ${String(left)}px ${String(top + height)}px, ${String(left + width)}px ${String(top + height)}px, ${String(left + width)}px ${String(top)}px, ${String(left)}px ${String(top)}px)`,
        }}
      />
      <div
        role="group"
        tabIndex={0}
        aria-label="Crop area. Drag to move; arrow keys nudge, Shift for larger steps."
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
        onPointerDown={(event) => {
          begin(event, 'move')
        }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={keyboard}
        className="pointer-events-auto absolute cursor-move touch-none outline-1 outline-white focus-visible:outline-2 focus-visible:outline-brand-400"
        style={{ left, top, width, height }}
      >
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(to_right,transparent_33%,rgb(255_255_255/0.4)_33%,rgb(255_255_255/0.4)_calc(33%+1px),transparent_calc(33%+1px),transparent_66%,rgb(255_255_255/0.4)_66%,rgb(255_255_255/0.4)_calc(66%+1px),transparent_calc(66%+1px)),linear-gradient(to_bottom,transparent_33%,rgb(255_255_255/0.4)_33%,rgb(255_255_255/0.4)_calc(33%+1px),transparent_calc(33%+1px),transparent_66%,rgb(255_255_255/0.4)_66%,rgb(255_255_255/0.4)_calc(66%+1px),transparent_calc(66%+1px))]"
        />
        {CROP_HANDLES.map((handle) => (
          <button
            key={handle}
            type="button"
            aria-label={`Resize crop from the ${HANDLE_LABELS[handle]}`}
            onPointerDown={(event) => {
              begin(event, handle)
            }}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            className={`absolute size-3.5 touch-none rounded-sm border-2 border-brand-600 bg-white shadow ${HANDLE_POSITIONS[handle]}`}
          />
        ))}
      </div>
    </div>
  )
}
