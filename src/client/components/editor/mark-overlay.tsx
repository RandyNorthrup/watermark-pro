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
import { clampMarkCentre, fitMarkSize, rotatedMarkSize, type Size } from '../../engine/layout'
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
  gridSpacing?: number | undefined
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
/** A tap selects without moving or adding a history entry. */
const DRAG_START_DISTANCE_PX = 3
/** Guide lines sit on the rule-of-thirds divisions as well as the centre. */
const THIRDS_DIVISOR = 3
const THIRD = 1 / THIRDS_DIVISOR
const NUDGE_FRACTION = 0.01
const NUDGE_FRACTION_LARGE = 0.05
const SCALE_STEP = 1.05
const ROTATION_STEP_DEGREES = 5
const ROTATE_HANDLE_OFFSET_PX = 28
const HANDLE_SIZE_PX = 16
const HANDLE_HALF_PX = HANDLE_SIZE_PX / 2
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
  'absolute min-h-0 min-w-0 touch-none border-2 border-brand-600 bg-white shadow after:absolute after:-inset-3 after:content-[""]'

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
  gridSpacing,
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
  const frameElement = useRef<HTMLDivElement | null>(null)
  const [isEngaged, setIsEngaged] = useState(false)
  const dragRef = useRef<DragState | null>(null)
  useEffect(() => {
    function dismiss(event: globalThis.PointerEvent) {
      if (dragRef.current !== null) return
      if (event.target instanceof Node && frameElement.current?.contains(event.target) !== true)
        setIsEngaged(false)
    }
    document.addEventListener('pointerdown', dismiss, { capture: true })
    return () => document.removeEventListener('pointerdown', dismiss, true)
  }, [])
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
  const gestureStartedRef = useRef(false)
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
  const areHandlesVisible = active && isEngaged
  const currentScale = livePatch.scale ?? scale
  const currentRotation = livePatch.rotation ?? rotation
  function sizeFor(nextScale: number, nextRotation: number): Size {
    const requestedWidth = nextScale * displaySize.width
    return fitMarkSize(
      { width: requestedWidth, height: (requestedWidth * placement.height) / placement.width },
      displaySize,
      nextRotation,
    )
  }
  const { width, height } = sizeFor(currentScale, currentRotation)
  const rawCentre: Point = {
    x:
      (livePatch.x ??
        (position?.mode === 'custom' ? position.x : undefined) ??
        placement.centreX / previewSize.width) * displaySize.width,
    y:
      (livePatch.y ??
        (position?.mode === 'custom' ? position.y : undefined) ??
        placement.centreY / previewSize.height) * displaySize.height,
  }
  const centre = clampMarkCentre(rawCentre, displaySize, { width, height }, currentRotation)

  /** Bring a handle inward at photo edges without expanding the watermark's drag boundary. */
  function handlePosition(local: Point): Point {
    const angle = (currentRotation * Math.PI) / HALF_TURN
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    const point = clampMarkCentre(
      {
        x: centre.x + local.x * cosine + local.y * sine,
        y: centre.y - local.x * sine + local.y * cosine,
      },
      displaySize,
      { width: HANDLE_SIZE_PX, height: HANDLE_SIZE_PX },
      currentRotation,
    )
    const dx = point.x - centre.x
    const dy = point.y - centre.y
    return {
      x: width / 2 + dx * cosine - dy * sine - HANDLE_HALF_PX,
      y: height / 2 + dx * sine + dy * cosine - HANDLE_HALF_PX,
    }
  }
  const rotateHandle = handlePosition({
    x: 0,
    y: -height / 2 - ROTATE_HANDLE_OFFSET_PX + HANDLE_HALF_PX,
  })
  const resizeHandle = handlePosition({ x: width / 2, y: height / 2 })
  const stem = {
    x: rotateHandle.x + HANDLE_HALF_PX - width / 2,
    y: rotateHandle.y + HANDLE_HALF_PX,
  }
  const stemLength = Math.max(0, Math.hypot(stem.x, stem.y) - HANDLE_HALF_PX)

  function boundedPatch(patch: MarkPatch): MarkPatch {
    const next = { ...(dragRef.current !== null && patchRef.current), ...patch }
    const nextRotation = next.rotation ?? currentRotation
    const size = sizeFor(next.scale ?? currentScale, nextRotation)
    const x = next.x ?? centre.x / displaySize.width
    const y = next.y ?? centre.y / displaySize.height
    const requested = { x: x * displaySize.width, y: y * displaySize.height }
    const point = clampMarkCentre(requested, displaySize, size, nextRotation)
    return {
      ...next,
      x: point.x === requested.x ? x : point.x / displaySize.width,
      y: point.y === requested.y ? y : point.y / displaySize.height,
    }
  }

  function emitMove(patch: MarkPatch) {
    if (!gestureStartedRef.current) {
      gestureStartedRef.current = true
      gestureCallback.current({ phase: 'start', patch: {} })
    }
    patchRef.current = boundedPatch(patch)
    gestureCallback.current({ phase: 'move', patch: patchRef.current })
  }
  const marginPx = margin * Math.min(displaySize.width, displaySize.height)

  /**
   * Where a dragged centre lands: on the nearest guide line when one is
   * within reach, unless Alt is held to place it freely. Reports the guides
   * to draw as a side effect of the drag.
   */
  function snappedCentre(
    raw: Point,
    isFree: boolean,
    nextScale = currentScale,
    nextRotation = currentRotation,
  ): Point {
    if (isFree) {
      setGuides({ x: null, y: null })
      return raw
    }
    const size = sizeFor(nextScale, nextRotation)
    const footprint = rotatedMarkSize(size, nextRotation)
    if (gridSpacing !== undefined && gridSpacing > 0) {
      const snapped = clampMarkCentre(raw, displaySize, size, nextRotation, gridSpacing)
      setGuides({ x: snapped.x - footprint.width / 2, y: snapped.y - footprint.height / 2 })
      return snapped
    }
    const x = snapTo(raw.x, guideLines(displaySize.width, footprint.width, marginPx))
    const y = snapTo(raw.y, guideLines(displaySize.height, footprint.height, marginPx))
    setGuides({ x: x.line, y: y.line })
    return { x: x.value, y: y.value }
  }

  function beginSingle(event: PointerEvent<HTMLElement>, kind: SingleDrag['kind']) {
    if (dragRef.current !== null) {
      frameDown(event)
      return
    }
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    originRef.current = origin(event.currentTarget)
    const start = localPoint(event)
    pointersRef.current.set(event.pointerId, start)
    patchRef.current = {}
    gestureStartedRef.current = false
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
    const drag = dragRef.current
    if (drag?.kind === 'pinch') {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    setIsEngaged(true)
    frameElement.current?.focus({ preventScroll: true })
    onSelect?.()
    pointersRef.current.set(event.pointerId, localPoint(event))
    if (drag === null) {
      beginSingle(event, 'move')
    } else {
      beginPinch(event, drag)
    }
  }

  function moveSingle(drag: SingleDrag, point: Point, isFree: boolean) {
    if (!gestureStartedRef.current && distance(point, drag.start) < DRAG_START_DISTANCE_PX) return
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
    if (
      !gestureStartedRef.current &&
      distance(mid, drag.startMidpoint) < DRAG_START_DISTANCE_PX &&
      Math.abs(distance(a, b) - drag.startDistance) < DRAG_START_DISTANCE_PX &&
      Math.abs(angle(a, b) - drag.startAngle) * drag.startDistance < DRAG_START_DISTANCE_PX
    )
      return
    const next = snappedCentre(
      {
        x: drag.centre.x + mid.x - drag.startMidpoint.x,
        y: drag.centre.y + mid.y - drag.startMidpoint.y,
      },
      isFree,
      clampScale(drag.scale * factor),
      normaliseRotation(drag.rotation - twist),
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
    if (drag.kind === 'pinch' && event.type === 'pointerup') {
      const remainingId = drag.pointerIds.find((id) => id !== event.pointerId)
      const remainingPoint =
        remainingId === undefined ? undefined : pointersRef.current.get(remainingId)
      if (remainingId !== undefined && remainingPoint !== undefined) {
        pointersRef.current.delete(event.pointerId)
        dragRef.current = {
          kind: 'move',
          pointerId: remainingId,
          start: remainingPoint,
          centre: {
            x: (patchRef.current.x ?? drag.centre.x / displaySize.width) * displaySize.width,
            y: (patchRef.current.y ?? drag.centre.y / displaySize.height) * displaySize.height,
          },
          startDistance: 0,
          startAngle: 0,
          scale: patchRef.current.scale ?? drag.scale,
          rotation: patchRef.current.rotation ?? drag.rotation,
        }
        lastPoint.current = null
        return
      }
    }
    pointersRef.current.clear()
    dragRef.current = null
    setGuides({ x: null, y: null })
    if (gestureStartedRef.current)
      gestureCallback.current({ phase: 'end', patch: patchRef.current })
    gestureStartedRef.current = false
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
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setIsEngaged(false)
      if (event.target instanceof HTMLElement) event.target.blur()
      return
    }
    const step = event.shiftKey ? NUDGE_FRACTION_LARGE : NUDGE_FRACTION
    const gridStep =
      gridSpacing !== undefined && !event.altKey ? (gridSpacing * step) / NUDGE_FRACTION : null
    const stepX = gridStep === null ? step : gridStep / displaySize.width
    const stepY = gridStep === null ? step : gridStep / displaySize.height
    const x = centre.x / displaySize.width
    const y = centre.y / displaySize.height
    const patches: Record<string, MarkPatch> = {
      ArrowLeft: { x: clamp(x - stepX, 0, 1), y },
      ArrowRight: { x: clamp(x + stepX, 0, 1), y },
      ArrowUp: { x, y: clamp(y - stepY, 0, 1) },
      ArrowDown: { x, y: clamp(y + stepY, 0, 1) },
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
    const next = boundedPatch(patch)
    if (gridStep !== null) {
      const snapped = snappedCentre(
        { x: (next.x ?? x) * displaySize.width, y: (next.y ?? y) * displaySize.height },
        false,
        next.scale ?? scale,
        next.rotation ?? rotation,
      )
      next.x = snapped.x / displaySize.width
      next.y = snapped.y / displaySize.height
    }
    gestureCallback.current({ phase: 'commit', patch: next })
  }

  return (
    <div data-mark-overlay="" className="pointer-events-none absolute inset-0 overflow-hidden">
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
        ref={frameElement}
        data-selection-visible={areHandlesVisible ? 'true' : 'false'}
        role="group"
        tabIndex={0}
        aria-label={t('editor.mark.position')}
        aria-current={active ? 'true' : undefined}
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight + - [ ]"
        onFocus={() => {
          setIsEngaged(true)
          onSelect?.()
        }}
        onBlur={(event) => {
          if (dragRef.current === null && !event.currentTarget.contains(event.relatedTarget))
            setIsEngaged(false)
        }}
        onPointerDown={frameDown}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
        onKeyDown={keyboard}
        className={`pointer-events-auto absolute cursor-move touch-none rounded-sm outline-2 -outline-offset-2 ${areHandlesVisible ? 'outline-white/90 focus-visible:outline-brand-400' : 'outline-transparent'}`}
        style={{
          left: centre.x - width / 2,
          top: centre.y - height / 2,
          width,
          height,
          transform: `rotate(${String(-currentRotation)}deg)`,
          boxShadow: areHandlesVisible ? 'inset 0 0 0 1px rgb(0 0 0 / 0.6)' : 'none',
        }}
      >
        {areHandlesVisible ? (
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
              className={`${HANDLE_CLASS} cursor-grab rounded-full`}
              style={{
                left: rotateHandle.x,
                top: rotateHandle.y,
                width: HANDLE_SIZE_PX,
                height: HANDLE_SIZE_PX,
              }}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 w-px bg-white/90"
              style={{
                top: 0,
                height: stemLength,
                transformOrigin: 'top center',
                transform: `rotate(${String(Math.atan2(stem.y, stem.x) * RADIANS_TO_DEGREES - HALF_TURN / 2)}deg)`,
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
              className={`${HANDLE_CLASS} cursor-nwse-resize rounded-sm`}
              style={{
                left: resizeHandle.x,
                top: resizeHandle.y,
                width: HANDLE_SIZE_PX,
                height: HANDLE_SIZE_PX,
              }}
            />
          </>
        ) : null}
      </div>
    </div>
  )
}
