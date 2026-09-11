import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'

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
  /** Latest authoritative placement; the worker result may be an older frame. */
  position?: { mode: string; x?: number; y?: number } | undefined
  renderedScale?: number | undefined
  /** Pixel size of the rendered preview the placement refers to. */
  previewSize: Size
  /** On-screen size of the preview image. */
  displaySize: Size
  scale: number
  rotation: number
  /** The mark's margin as a fraction of the shorter image side, for the snap lines. */
  margin: number
  /** Whether this mark owns the visible transform handles. */
  active?: boolean | undefined
  /** Selects the mark before a direct manipulation starts. */
  onSelect?: (() => void) | undefined
  onGesture: (gesture: MarkGesture) => void
}

/** Guide lines shown while a drag is snapped, in display pixels. */
interface Guides {
  x: number | null
  y: number | null
}

interface Point {
  x: number
  y: number
}

/** One finger or the mouse on the frame or a handle. */
interface SingleDrag {
  kind: 'move' | 'scale' | 'rotate'
  pointerId: number
  start: Point
  centre: Point
  startDistance: number
  startAngle: number
  scale: number
  rotation: number
}

/** Two fingers on the frame: pinch to scale, twist to rotate, and the pair's midpoint moves the mark. */
interface PinchDrag {
  kind: 'pinch'
  pointerIds: [number, number]
  startDistance: number
  startAngle: number
  startMidpoint: Point
  centre: Point
  scale: number
  rotation: number
}

type DragState = SingleDrag | PinchDrag

/** Distance within which a dragged centre jumps to a guide line, in display pixels. */
const SNAP_DISTANCE_PX = 8
/** Guide lines sit on the rule-of-thirds divisions as well as the centre. */
const THIRDS_DIVISOR = 3
const THIRD = 1 / THIRDS_DIVISOR
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
function origin(target: HTMLElement): Point {
  const rect = (target.closest('[data-mark-overlay]') ?? target).getBoundingClientRect()
  return { x: rect.left, y: rect.top }
}

function localPoint(event: PointerEvent<HTMLElement>): Point {
  const root = origin(event.currentTarget)
  return { x: event.clientX - root.x, y: event.clientY - root.y }
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function angle(from: Point, to: Point): number {
  return Math.atan2(to.y - from.y, to.x - from.x)
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/**
 * The centre positions along one axis that line the mark up with the
 * margin, the thirds and the middle: what a designer would reach for.
 */
function guideLines(extent: number, markExtent: number, marginPx: number): number[] {
  return [
    marginPx + markExtent / 2,
    extent * THIRD,
    extent / 2,
    extent * (1 - THIRD),
    extent - marginPx - markExtent / 2,
  ]
}

/** The nearest guide within reach, or the value itself. */
function snapTo(value: number, lines: readonly number[]): { value: number; line: number | null } {
  let best: number | null = null
  for (const line of lines) {
    if (
      Math.abs(line - value) <= SNAP_DISTANCE_PX &&
      (best === null || Math.abs(line - value) < Math.abs(best - value))
    ) {
      best = line
    }
  }
  return best === null ? { value, line: null } : { value: best, line: best }
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

function clampScale(value: number): number {
  return clamp(value, MIN_SCALE, MAX_SCALE)
}

const HANDLE_CLASS =
  'absolute touch-none border-2 border-brand-600 bg-white shadow after:absolute after:-inset-3 after:content-[""] pointer-coarse:size-6'

/**
 * Draggable frame around the mark in the preview: drag to move, the corner
 * handle to scale, the top handle to rotate. Touch: pinch with two fingers
 * to scale, twist them to rotate. Keyboard: arrows nudge (Shift for larger
 * steps), plus and minus scale, square brackets rotate. Handles keep a
 * 44 px hit area on coarse pointers.
 */
export function MarkOverlay({
  placement,
  position,
  renderedScale,
  previewSize,
  displaySize,
  scale,
  rotation,
  margin,
  active = true,
  onSelect,
  onGesture,
}: MarkOverlayProps) {
  const { t } = useTranslation()
  const dragRef = useRef<DragState | null>(null)
  const gestureCallback = useRef(onGesture)
  useLayoutEffect(() => {
    gestureCallback.current = onGesture
  }, [onGesture])
  /** Every pointer currently down on the frame, for the pinch gesture. */
  const pointersRef = useRef(new Map<number, Point>())
  const [guides, setGuides] = useState<Guides>({ x: null, y: null })
  const frameRef = useRef<number | null>(null)
  const pendingRef = useRef<{ point: Point; pointerId: number; isFree: boolean } | null>(null)
  const lastPoint = useRef<{ x: number; y: number; pointerId: number; isFree: boolean } | null>(
    null,
  )
  const patchRef = useRef<MarkPatch>({})
  const originRef = useRef<Point>({ x: 0, y: 0 })
  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      pendingRef.current = null
      dragRef.current = null
    },
    [],
  )
  const k = displaySize.width / previewSize.width
  if (!(k > 0) || !Number.isFinite(k)) {
    return null
  }
  const livePatch = dragRef.current === null ? {} : patchRef.current
  const currentScale = livePatch.scale ?? scale
  const currentRotation = livePatch.rotation ?? rotation
  const ratio = currentScale / (renderedScale ?? scale)
  const width = placement.width * k * ratio
  const height = placement.height * k * ratio
  const centre: Point = {
    x:
      (livePatch.x ??
        (position?.mode === 'custom' ? position.x : undefined) ??
        placement.centreX / previewSize.width) * displaySize.width,
    y:
      (livePatch.y ??
        (position?.mode === 'custom' ? position.y : undefined) ??
        placement.centreY / previewSize.height) * displaySize.height,
  }

  function emitMove(patch: MarkPatch) {
    patchRef.current = { ...patchRef.current, ...patch }
    gestureCallback.current({ phase: 'move', patch: patchRef.current })
  }
  const marginPx = margin * Math.min(displaySize.width, displaySize.height)

  /**
   * Where a dragged centre lands: on the nearest guide line when one is
   * within reach, unless Alt is held to place it freely. Reports the guides
   * to draw as a side effect of the drag.
   */
  function snappedCentre(raw: Point, isFree: boolean): Point {
    if (isFree) {
      setGuides({ x: null, y: null })
      return raw
    }
    const x = snapTo(raw.x, guideLines(displaySize.width, width, marginPx))
    const y = snapTo(raw.y, guideLines(displaySize.height, height, marginPx))
    setGuides({ x: x.line, y: y.line })
    return { x: x.value, y: y.value }
  }

  function beginSingle(event: PointerEvent<HTMLElement>, kind: SingleDrag['kind']) {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    originRef.current = origin(event.currentTarget)
    const start = localPoint(event)
    patchRef.current = {}
    lastPoint.current = null
    dragRef.current = {
      kind,
      pointerId: event.pointerId,
      start,
      centre,
      startDistance: distance(start, centre),
      startAngle: angle(centre, start),
      scale,
      rotation,
    }
    gestureCallback.current({ phase: 'start', patch: {} })
  }

  /** A second finger on the frame turns the move into a pinch; the checkpoint from the move stands. */
  function beginPinch(event: PointerEvent<HTMLElement>, first: SingleDrag) {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const a = pointersRef.current.get(first.pointerId)
    if (a === undefined) {
      return
    }
    flush()
    const b = localPoint(event)
    dragRef.current = {
      kind: 'pinch',
      pointerIds: [first.pointerId, event.pointerId],
      startDistance: distance(a, b),
      startAngle: angle(a, b),
      startMidpoint: midpoint(a, b),
      centre: {
        x: (patchRef.current.x ?? first.centre.x / displaySize.width) * displaySize.width,
        y: (patchRef.current.y ?? first.centre.y / displaySize.height) * displaySize.height,
      },
      scale: patchRef.current.scale ?? first.scale,
      rotation: patchRef.current.rotation ?? first.rotation,
    }
  }

  function frameDown(event: PointerEvent<HTMLElement>) {
    onSelect?.()
    pointersRef.current.set(event.pointerId, localPoint(event))
    const drag = dragRef.current
    if (drag === null) {
      beginSingle(event, 'move')
    } else if (drag.kind === 'move') {
      beginPinch(event, drag)
    }
  }

  function moveSingle(drag: SingleDrag, point: Point, isFree: boolean) {
    if (drag.kind === 'move') {
      const next = snappedCentre(
        { x: drag.centre.x + point.x - drag.start.x, y: drag.centre.y + point.y - drag.start.y },
        isFree,
      )
      emitMove({
        x: clamp(next.x / displaySize.width, 0, 1),
        y: clamp(next.y / displaySize.height, 0, 1),
      })
    } else if (drag.kind === 'scale') {
      const factor = drag.startDistance > 0 ? distance(point, drag.centre) / drag.startDistance : 1
      emitMove({ scale: clampScale(drag.scale * factor) })
      setGuides({ x: null, y: null })
    } else {
      const delta = (angle(drag.centre, point) - drag.startAngle) * RADIANS_TO_DEGREES
      emitMove({ rotation: normaliseRotation(drag.rotation - delta) })
      setGuides({ x: null, y: null })
    }
  }

  function movePinch(drag: PinchDrag, isFree: boolean) {
    const a = pointersRef.current.get(drag.pointerIds[0])
    const b = pointersRef.current.get(drag.pointerIds[1])
    if (a === undefined || b === undefined) {
      return
    }
    const factor = drag.startDistance > 0 ? distance(a, b) / drag.startDistance : 1
    const twist = (angle(a, b) - drag.startAngle) * RADIANS_TO_DEGREES
    const mid = midpoint(a, b)
    const next = snappedCentre(
      {
        x: drag.centre.x + mid.x - drag.startMidpoint.x,
        y: drag.centre.y + mid.y - drag.startMidpoint.y,
      },
      isFree,
    )
    emitMove({
      x: clamp(next.x / displaySize.width, 0, 1),
      y: clamp(next.y / displaySize.height, 0, 1),
      scale: clampScale(drag.scale * factor),
      rotation: normaliseRotation(drag.rotation - twist),
    })
  }

  function flush() {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
    const pending = pendingRef.current
    pendingRef.current = null
    const drag = dragRef.current
    if (pending === null || drag === null) return
    if (drag.kind === 'pinch') movePinch(drag, pending.isFree)
    else moveSingle(drag, pending.point, pending.isFree)
  }

  function move(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current
    if (drag === null) return
    const isOwner =
      drag.kind === 'pinch'
        ? drag.pointerIds.includes(event.pointerId)
        : drag.pointerId === event.pointerId
    if (!isOwner) return
    const point = { x: event.clientX - originRef.current.x, y: event.clientY - originRef.current.y }
    const last = lastPoint.current
    if (
      last?.x === point.x &&
      last.y === point.y &&
      last.pointerId === event.pointerId &&
      last.isFree === event.altKey
    )
      return
    lastPoint.current = { ...point, pointerId: event.pointerId, isFree: event.altKey }
    if (pointersRef.current.has(event.pointerId)) pointersRef.current.set(event.pointerId, point)
    pendingRef.current = { point, pointerId: event.pointerId, isFree: event.altKey }
    frameRef.current ??= requestAnimationFrame(flush)
  }

  function end(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current
    if (drag === null) {
      return
    }
    const isOwner =
      drag.kind === 'pinch'
        ? drag.pointerIds.includes(event.pointerId)
        : drag.pointerId === event.pointerId
    if (!isOwner) {
      return
    }
    if (event.type === 'pointerup') move(event)
    flush()
    pointersRef.current.clear()
    dragRef.current = null
    setGuides({ x: null, y: null })
    gestureCallback.current({ phase: 'end', patch: patchRef.current })
  }

  /** Handle events must not reach the frame's own handlers as well. */
  function handleMove(event: PointerEvent<HTMLElement>) {
    event.stopPropagation()
    move(event)
  }

  function handleEnd(event: PointerEvent<HTMLElement>) {
    event.stopPropagation()
    end(event)
  }

  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? NUDGE_FRACTION_LARGE : NUDGE_FRACTION
    const x = centre.x / displaySize.width
    const y = centre.y / displaySize.height
    const patches: Record<string, MarkPatch> = {
      ArrowLeft: { x: clamp(x - step, 0, 1), y },
      ArrowRight: { x: clamp(x + step, 0, 1), y },
      ArrowUp: { x, y: clamp(y - step, 0, 1) },
      ArrowDown: { x, y: clamp(y + step, 0, 1) },
      '+': { scale: clampScale(scale * SCALE_STEP) },
      '=': { scale: clampScale(scale * SCALE_STEP) },
      '-': { scale: clampScale(scale / SCALE_STEP) },
      '[': { rotation: normaliseRotation(rotation - ROTATION_STEP_DEGREES) },
      ']': { rotation: normaliseRotation(rotation + ROTATION_STEP_DEGREES) },
    }
    const patch = patches[event.key]
    if (patch === undefined) {
      return
    }
    event.preventDefault()
    gestureCallback.current({ phase: 'commit', patch })
  }

  return (
    <div data-mark-overlay="" className="pointer-events-none absolute inset-0">
      {guides.x === null ? null : (
        <span
          data-snap-guide="x"
          aria-hidden="true"
          className="absolute inset-y-0 w-px bg-brand-400 shadow-[0_0_0_1px_rgb(0_0_0/0.4)]"
          style={{ left: guides.x }}
        />
      )}
      {guides.y === null ? null : (
        <span
          data-snap-guide="y"
          aria-hidden="true"
          className="absolute inset-x-0 h-px bg-brand-400 shadow-[0_0_0_1px_rgb(0_0_0/0.4)]"
          style={{ top: guides.y }}
        />
      )}
      <div
        role="group"
        tabIndex={0}
        aria-label={t('editor.mark.position')}
        aria-current={active ? 'true' : undefined}
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight + - [ ]"
        onFocus={onSelect}
        onPointerDown={frameDown}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
        onKeyDown={keyboard}
        className={`pointer-events-auto absolute cursor-move touch-none rounded-sm outline-2 outline-offset-2 focus-visible:outline-brand-400 ${active ? 'outline-white/90' : 'outline-transparent hover:outline-brand-300/80'}`}
        style={{
          left: centre.x - width / 2,
          top: centre.y - height / 2,
          width,
          height,
          transform: `rotate(${String(-currentRotation)}deg)`,
          boxShadow: '0 0 0 1px rgb(0 0 0 / 0.6)',
        }}
      >
        {active ? (
          <>
            <button
              type="button"
              aria-label={t('editor.mark.rotate')}
              onPointerDown={(event) => {
                beginSingle(event, 'rotate')
              }}
              onPointerMove={handleMove}
              onPointerUp={handleEnd}
              onPointerCancel={handleEnd}
              onLostPointerCapture={handleEnd}
              className={`${HANDLE_CLASS} left-1/2 size-4 -translate-x-1/2 cursor-grab rounded-full`}
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
              aria-label={t('editor.mark.resize')}
              onPointerDown={(event) => {
                beginSingle(event, 'scale')
              }}
              onPointerMove={handleMove}
              onPointerUp={handleEnd}
              onPointerCancel={handleEnd}
              onLostPointerCapture={handleEnd}
              className={`${HANDLE_CLASS} -right-2 -bottom-2 size-4 cursor-nwse-resize rounded-sm pointer-coarse:-right-3 pointer-coarse:-bottom-3`}
            />
          </>
        ) : null}
      </div>
    </div>
  )
}
