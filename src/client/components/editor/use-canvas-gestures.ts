import { type PointerEvent, useEffect, useLayoutEffect, useRef } from 'react'

import { MAX_CANVAS_ZOOM_PERCENT, MIN_CANVAS_ZOOM_PERCENT } from '../../../shared/constants'

interface Point {
  x: number
  y: number
}
interface Pinch {
  distance: number
  zoom: number
  imageX: number
  imageY: number
}
interface ViewUpdate {
  zoom: number
  anchor: Point
  imageX: number
  imageY: number
}

function midpoint(first: Point, second: Point): Point {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
}

function applyAnchor(viewport: HTMLDivElement | null, update: ViewUpdate): void {
  const image = viewport?.querySelector('[data-canvas-content], img')
  if (viewport === null || image == null) return
  const rect = image.getBoundingClientRect()
  viewport.scrollLeft += rect.left + (update.imageX * update.zoom) / 100 - update.anchor.x
  viewport.scrollTop += rect.top + (update.imageY * update.zoom) / 100 - update.anchor.y
}

/** Photo gestures change only the viewport; watermark gestures retain their own history. */
export function useCanvasGestures(
  viewport: HTMLDivElement | null,
  zoom: number,
  onZoom: (zoom: number) => void,
) {
  const pointers = useRef(new Map<number, Point>())
  const pinch = useRef<Pinch | null>(null)
  const frame = useRef<number | null>(null)
  const pending = useRef<ViewUpdate | null>(null)
  const anchor = useRef<ViewUpdate | null>(null)
  const action = useRef({ zoom, onZoom })
  useLayoutEffect(() => {
    action.current = { zoom, onZoom }
    const update = anchor.current
    if (update === null) return
    anchor.current = null
    applyAnchor(viewport, update)
  }, [viewport, zoom, onZoom])
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    },
    [],
  )

  function flush() {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    const next = pending.current
    pending.current = null
    if (next === null) return
    if (next.zoom === action.current.zoom) {
      applyAnchor(viewport, next)
      return
    }
    anchor.current = next
    action.current.onZoom(next.zoom)
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'touch' || event.defaultPrevented || pointers.current.size >= 2)
      return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const [first, second] = pointers.current.values()
    const image = event.currentTarget.querySelector('[data-canvas-content], img')
    if (first === undefined || second === undefined || image === null) return
    const centre = midpoint(first, second)
    const rect = image.getBoundingClientRect()
    pinch.current = {
      distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
      zoom: action.current.zoom,
      imageX: ((centre.x - rect.left) * 100) / action.current.zoom,
      imageY: ((centre.y - rect.top) * 100) / action.current.zoom,
    }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(event.pointerId)
    if (previous === undefined) return
    event.preventDefault()
    const next = { x: event.clientX, y: event.clientY }
    pointers.current.set(event.pointerId, next)
    const [first, second] = pointers.current.values()
    const start = pinch.current
    if (start === null || first === undefined || second === undefined) {
      event.currentTarget.scrollLeft += previous.x - next.x
      event.currentTarget.scrollTop += previous.y - next.y
      return
    }
    const distance = Math.hypot(second.x - first.x, second.y - first.y)
    pending.current = {
      zoom: Math.max(
        MIN_CANVAS_ZOOM_PERCENT,
        Math.min(MAX_CANVAS_ZOOM_PERCENT, (start.zoom * distance) / start.distance),
      ),
      anchor: midpoint(first, second),
      imageX: start.imageX,
      imageY: start.imageY,
    }
    frame.current ??= requestAnimationFrame(flush)
  }

  function end(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return
    if (event.type === 'pointerup') onPointerMove(event)
    flush()
    if (event.type === 'pointercancel') pointers.current.clear()
    else pointers.current.delete(event.pointerId)
    pinch.current = null
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: end,
    onPointerCancel: end,
    onLostPointerCapture: end,
  }
}
