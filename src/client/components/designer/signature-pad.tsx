import { Eraser, PenLine, Undo2 } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { type PointerEvent, useRef, useState } from 'react'

import {
  DEFAULT_PEN_WIDTH,
  drawStrokes,
  exportGeometry,
  PEN_WIDTHS,
  type Stroke,
  strokeBounds,
} from '../../editor/signature'
import { mainThreadBackend } from '../../lib/canvas-backend'
import { cn } from '../../lib/cn'
import { Button } from '../ui/button'

interface SignaturePadProps {
  /** Receives the drawing as a transparent PNG with its pixel size. */
  onSave: (file: File, size: { width: number; height: number }) => Promise<void>
  isSaving: boolean
}

/** The pad's drawing surface in CSS pixels; strokes are stored in this space. */
const PAD_WIDTH = 640
const PAD_HEIGHT = 320
const SIGNATURE_FILE_NAME = 'signature.png'

/** Pad coordinates of a pointer event, scaled from the on-screen canvas size. */
function padPoint(event: PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
  const rect = event.currentTarget.getBoundingClientRect()
  return {
    x: ((event.clientX - rect.left) / rect.width) * PAD_WIDTH,
    y: ((event.clientY - rect.top) / rect.height) * PAD_HEIGHT,
  }
}

/** Renders the strokes cropped to their bounds as a transparent PNG at logo resolution. */
async function exportSignature(strokes: readonly Stroke[]): Promise<{
  file: File
  width: number
  height: number
}> {
  const bounds = strokeBounds(strokes)
  if (bounds === null) {
    throw new Error('draw something first')
  }
  const geometry = exportGeometry(bounds)
  const canvas = mainThreadBackend().createCanvas(geometry.width, geometry.height)
  canvas.context.translate(geometry.offsetX * geometry.scale, geometry.offsetY * geometry.scale)
  drawStrokes(canvas.context, strokes, geometry.scale)
  const blob = await canvas.encode({ format: 'image/png', quality: 1 })
  return {
    file: new File([blob], SIGNATURE_FILE_NAME, { type: 'image/png' }),
    width: geometry.width,
    height: geometry.height,
  }
}

/**
 * Draw a signature with a finger, pen or mouse and save it as a logo. The
 * pad keeps strokes as data and redraws them, so undo is exact and the
 * saved image is rendered at full resolution rather than from the screen.
 */
export function SignaturePad({ onSave, isSaving }: SignaturePadProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [penWidth, setPenWidth] = useState<number>(DEFAULT_PEN_WIDTH)
  const [error, setError] = useState<string | null>(null)
  const activeStroke = useRef<Stroke | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  function repaint(next: readonly Stroke[]) {
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx === null || ctx === undefined) {
      return
    }
    ctx.clearRect(0, 0, PAD_WIDTH, PAD_HEIGHT)
    drawStrokes(ctx, next)
  }

  function begin(event: PointerEvent<HTMLCanvasElement>) {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const stroke: Stroke = { points: [padPoint(event)], width: penWidth }
    activeStroke.current = stroke
    repaint([...strokes, stroke])
  }

  function extend(event: PointerEvent<HTMLCanvasElement>) {
    const stroke = activeStroke.current
    if (stroke === null) {
      return
    }
    stroke.points.push(padPoint(event))
    repaint([...strokes, stroke])
  }

  function finish() {
    const stroke = activeStroke.current
    if (stroke === null) {
      return
    }
    activeStroke.current = null
    const next = [...strokes, stroke]
    setStrokes(next)
    repaint(next)
  }

  function undo() {
    const next = strokes.slice(0, -1)
    setStrokes(next)
    repaint(next)
  }

  function clear() {
    setStrokes([])
    repaint([])
  }

  async function save() {
    setError(null)
    try {
      const { file, width, height } = await exportSignature(strokes)
      await onSave(file, { width, height })
      setIsOpen(false)
      clear()
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_))
    }
  }

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open)
        if (!open) {
          setError(null)
        }
      }}
    >
      <Dialog.Trigger asChild>
        <Button type="button" variant="secondary">
          <PenLine aria-hidden="true" className="size-4" />
          Draw a signature
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 flex w-[min(96vw,44rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-card border border-line bg-surface-raised p-4 shadow-card sm:p-6">
          <div>
            <Dialog.Title className="text-lg font-semibold">Draw a signature</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-ink-muted">
              Sign with a finger, a pen or the mouse. It is saved as a transparent logo in the
              library, cropped to the ink.
            </Dialog.Description>
          </div>
          <canvas
            ref={(canvas) => {
              canvasRef.current = canvas
              repaint(strokes)
            }}
            width={PAD_WIDTH}
            height={PAD_HEIGHT}
            role="img"
            aria-label="Signature pad; draw here"
            className="w-full touch-none rounded-lg border border-line bg-white shadow-inner"
            style={{ aspectRatio: `${String(PAD_WIDTH)} / ${String(PAD_HEIGHT)}` }}
            onPointerDown={begin}
            onPointerMove={extend}
            onPointerUp={finish}
            onPointerCancel={finish}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Pen</span>
            <div role="radiogroup" aria-label="Pen width" className="flex gap-1">
              {PEN_WIDTHS.map((width) => (
                <button
                  key={width}
                  type="button"
                  role="radio"
                  aria-checked={penWidth === width}
                  aria-label={`${String(width)} pixel pen`}
                  onClick={() => {
                    setPenWidth(width)
                  }}
                  className={cn(
                    'flex size-9 items-center justify-center rounded-lg border border-line',
                    penWidth === width && 'border-brand-500 bg-brand-50 dark:bg-brand-900/40',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="rounded-full bg-ink"
                    style={{ width: width * 2, height: width * 2 }}
                  />
                </button>
              ))}
            </div>
            <div className="ml-auto flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={strokes.length === 0}
                onClick={undo}
              >
                <Undo2 aria-hidden="true" className="size-4" />
                Undo stroke
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={strokes.length === 0}
                onClick={clear}
              >
                <Eraser aria-hidden="true" className="size-4" />
                Clear
              </Button>
            </div>
          </div>
          {error === null ? null : (
            <p role="alert" className="text-sm text-rose-600">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              type="button"
              isPending={isSaving}
              disabled={strokes.length === 0}
              onClick={() => {
                void save()
              }}
            >
              Save as logo
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
