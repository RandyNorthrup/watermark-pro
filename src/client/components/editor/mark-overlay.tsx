import { type KeyboardEvent, type PointerEvent, useRef } from 'react'

import { MAX_ROTATION_DEGREES, MAX_SCALE, MIN_SCALE } from '../../../shared/watermark'
import type { Size } from '../../engine/layout'
import type { MarkPlacement } from '../../engine/pipeline'

export interface MarkPatch {
  /** Centre as fractions of the output image. */
  x?: number
  y?: number
  scale?: number
  rotation?: number
}

export type GesturePhase = 'start' | 'move' | 'end' | 'commit'

export interface MarkGesture {
  phase: GesturePhase
  patch: MarkPatch
}

interface MarkOverlayProps {
  placement: MarkPlacement
  /** Pixel size of the rendered preview the placement refers to. */
  previewSize: Size
  /** On-screen size of the preview image. */
  displaySize: Size
  scale: number
  rotation: number
  onGesture: (gesture: MarkGesture) => void
}

type DragKind = 'move' | 'scale' | 'rotate'

interface DragState {
  kind: DragKind
  pointerId: number
  startX: number
  startY: number
  centreX: number
  centreY: number
  startDistance: number
  startAngle: number
  scale: number
  rotation: number
}

const NUDGE_FRACTION = 0.01
const NUDGE_FRACTION_LARGE = 0.05
const SCALE_STEP = 1.05
const ROTATION_STEP_DEGREES = 5
const ROTATE_HANDLE_OFFSET_PX = 28
/** Gap between the frame and the start of the rotate handle's stem. */
const ROTATE_STEM_GAP_PX = 8
const HALF_TURN = 180
const FULL_TURN = 360
const RADIANS_TO_DEGREES = HALF_TURN / Math.PI

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high)
}

/** The overlay root's top-left in client coordinates. */
function originX(target: HTMLElement): number {
  return (target.closest('[data-mark-overlay]') ?? target).getBoundingClientRect().left
}

function originY(target: HTMLElement): number {
  return (target.closest('[data-mark-overlay]') ?? target).getBoundingClientRect().top
}

function normaliseRotation(degrees: number): number {
  let value = degrees
  while (value > HALF_TURN) {
    value -= FULL_TURN
  }
  while (value < -HALF_TURN) {
    value += FULL_TURN
  }
  return clamp(value, -MAX_ROTATION_DEGREES, MAX_ROTATION_DEGREES)
}

/**
 * Draggable frame around the mark in the preview: drag to move, the corner
 * handle to scale, the top handle to rotate. Keyboard: arrows nudge (Shift
 * for larger steps), plus and minus scale, square brackets rotate.
 */
export function MarkOverlay({
  placement,
  previewSize,
  displaySize,
  scale,
  rotation,
  onGesture,
}: MarkOverlayProps) {
  const dragRef = useRef<DragState | null>(null)
  const k = displaySize.width / previewSize.width
  if (!(k > 0) || !Number.isFinite(k)) {
    return null
  }
  const width = placement.width * k
  const height = placement.height * k
  const centreX = placement.centreX * k
  const centreY = placement.centreY * k

  function begin(event: PointerEvent<HTMLElement>, kind: DragKind) {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const dx = event.clientX - originX(event.currentTarget)
    const dy = event.clientY - originY(event.currentTarget)
    dragRef.current = {
      kind,
      pointerId: event.pointerId,
      startX: dx,
      startY: dy,
      centreX,
      centreY,
      startDistance: Math.hypot(dx - centreX, dy - centreY),
      startAngle: Math.atan2(dy - centreY, dx - centreX),
      scale,
      rotation,
    }
    onGesture({ phase: 'start', patch: {} })
  }

  function move(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current
    if (drag?.pointerId !== event.pointerId) {
      return
    }
    const x = event.clientX - originX(event.currentTarget)
    const y = event.clientY - originY(event.currentTarget)
    if (drag.kind === 'move') {
      const nextCentreX = drag.centreX + (x - drag.startX)
      const nextCentreY = drag.centreY + (y - drag.startY)
      onGesture({
        phase: 'move',
        patch: {
          x: clamp(nextCentreX / displaySize.width, 0, 1),
          y: clamp(nextCentreY / displaySize.height, 0, 1),
        },
      })
    } else if (drag.kind === 'scale') {
      const distance = Math.hypot(x - drag.centreX, y - drag.centreY)
      const factor = drag.startDistance > 0 ? distance / drag.startDistance : 1
      onGesture({
        phase: 'move',
        patch: { scale: clamp(drag.scale * factor, MIN_SCALE, MAX_SCALE) },
      })
    } else {
      const angle = Math.atan2(y - drag.centreY, x - drag.centreX)
      const delta = (angle - drag.startAngle) * RADIANS_TO_DEGREES
      onGesture({ phase: 'move', patch: { rotation: normaliseRotation(drag.rotation - delta) } })
    }
  }

  function end(event: PointerEvent<HTMLElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) {
      return
    }
    dragRef.current = null
    onGesture({ phase: 'end', patch: {} })
  }

  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? NUDGE_FRACTION_LARGE : NUDGE_FRACTION
    const x = placement.centreX / previewSize.width
    const y = placement.centreY / previewSize.height
    const patches: Record<string, MarkPatch> = {
      ArrowLeft: { x: clamp(x - step, 0, 1), y },
      ArrowRight: { x: clamp(x + step, 0, 1), y },
      ArrowUp: { x, y: clamp(y - step, 0, 1) },
      ArrowDown: { x, y: clamp(y + step, 0, 1) },
      '+': { scale: clamp(scale * SCALE_STEP, MIN_SCALE, MAX_SCALE) },
      '=': { scale: clamp(scale * SCALE_STEP, MIN_SCALE, MAX_SCALE) },
      '-': { scale: clamp(scale / SCALE_STEP, MIN_SCALE, MAX_SCALE) },
      '[': { rotation: normaliseRotation(rotation - ROTATION_STEP_DEGREES) },
      ']': { rotation: normaliseRotation(rotation + ROTATION_STEP_DEGREES) },
    }
    const patch = patches[event.key]
    if (patch === undefined) {
      return
    }
    event.preventDefault()
    onGesture({ phase: 'commit', patch })
  }

  return (
    <div data-mark-overlay="" className="pointer-events-none absolute inset-0">
      <div
        role="group"
        tabIndex={0}
        aria-label="Watermark position. Drag to move; arrow keys nudge, plus and minus resize, square brackets rotate."
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight + - [ ]"
        onPointerDown={(event) => {
          begin(event, 'move')
        }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={keyboard}
        className="pointer-events-auto absolute cursor-move touch-none rounded-sm outline-2 outline-offset-2 outline-white/90 focus-visible:outline-brand-400"
        style={{
          left: centreX - width / 2,
          top: centreY - height / 2,
          width,
          height,
          transform: `rotate(${String(-rotation)}deg)`,
          boxShadow: '0 0 0 1px rgb(0 0 0 / 0.6)',
        }}
      >
        <button
          type="button"
          aria-label="Rotate watermark"
          onPointerDown={(event) => {
            begin(event, 'rotate')
          }}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          className="absolute left-1/2 size-4 -translate-x-1/2 cursor-grab touch-none rounded-full border-2 border-brand-600 bg-white shadow"
          style={{ top: -ROTATE_HANDLE_OFFSET_PX }}
        />
        <span
          aria-hidden="true"
          className="absolute left-1/2 w-px -translate-x-1/2 bg-white/90"
          style={{
            top: -ROTATE_HANDLE_OFFSET_PX + ROTATE_STEM_GAP_PX,
            height: ROTATE_HANDLE_OFFSET_PX - ROTATE_STEM_GAP_PX,
          }}
        />
        <button
          type="button"
          aria-label="Resize watermark"
          onPointerDown={(event) => {
            begin(event, 'scale')
          }}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          className="absolute -right-2 -bottom-2 size-4 cursor-nwse-resize touch-none rounded-sm border-2 border-brand-600 bg-white shadow"
        />
      </div>
    </div>
  )
}
