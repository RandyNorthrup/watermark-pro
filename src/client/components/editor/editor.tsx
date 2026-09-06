import { useQuery } from '@tanstack/react-query'
import { Crop, Download, ImagePlus, Redo2, RotateCcw, Scaling, Stamp, Undo2 } from 'lucide-react'
import { Tabs } from 'radix-ui'
import { type DragEvent, useEffect, useReducer, useRef, useState } from 'react'

import { CropOverlay, type CropGesture } from './crop-overlay'
import { CropPanel } from './crop-panel'
import { ExportPanel } from './export-panel'
import { FORMAT_EXTENSIONS } from './formats'
import { MarkOverlay, type MarkGesture, type MarkPatch } from './mark-overlay'
import { ResizePanel } from './resize-panel'
import { useRenderer } from './use-renderer'
import { WatermarkPanel } from './watermark-panel'
import type { WatermarkDto } from '../../../shared/api'
import { DEFAULT_TEXT_SPEC, type WatermarkSpec } from '../../../shared/watermark'
import {
  ASPECT_PRESETS,
  type CropRect,
  croppedSize,
  fullCrop,
  resolveRatio,
} from '../../editor/geometry'
import {
  canRedo,
  canUndo,
  createHistory,
  type EditorDocument,
  editorReducer,
} from '../../editor/state'
import type { EncodeOptions } from '../../engine/encode'
import type { Size } from '../../engine/layout'
import type { Transform } from '../../engine/pipeline'
import { downloadBlob } from '../../lib/download'
import { describeError } from '../../lib/errors'
import { readImageSize } from '../../lib/image-size'
import { watermarksQueryOptions } from '../../lib/library'
import { SAMPLE_PHOTO_HEIGHT, SAMPLE_PHOTO_WIDTH } from '../../lib/sample-photo'
import { withPlacement, withStyle } from '../../lib/spec-edit'
import { useElementSize } from '../../lib/use-element-size'
import { Alert } from '../ui/alert'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { Spinner } from '../ui/spinner'

interface EditorProps {
  organizationId: string
  /** Preset to load when the editor opens (from the library's "Open in editor"). */
  initialPresetId?: string | null | undefined
}

type Tool = 'watermark' | 'crop' | 'resize' | 'export'

const TOOLS: readonly { value: Tool; label: string; icon: typeof Stamp }[] = [
  { value: 'watermark', label: 'Watermark', icon: Stamp },
  { value: 'crop', label: 'Crop', icon: Crop },
  { value: 'resize', label: 'Resize', icon: Scaling },
  { value: 'export', label: 'Export', icon: Download },
]

const ACCEPTED_PHOTO_TYPES = 'image/png,image/jpeg,image/webp,image/avif,image/gif'
const SAMPLE_SIZE: Size = { width: SAMPLE_PHOTO_WIDTH, height: SAMPLE_PHOTO_HEIGHT }

/** Renders the photo alone: the default mark at zero opacity. */
const PHOTO_ONLY_SPEC: WatermarkSpec = withStyle(DEFAULT_TEXT_SPEC, { opacity: 0 })

interface Photo {
  file: File
  size: Size
}

function isTool(value: string): value is Tool {
  return TOOLS.some((tool) => tool.value === value)
}

function applyMarkPatch(spec: WatermarkSpec, patch: MarkPatch): WatermarkSpec {
  let next = spec
  if (patch.x !== undefined && patch.y !== undefined) {
    next = withPlacement(next, { mode: 'custom', x: patch.x, y: patch.y })
  }
  if (patch.scale !== undefined) {
    next = withStyle(next, { scale: patch.scale })
  }
  if (patch.rotation !== undefined) {
    next = withStyle(next, { rotation: patch.rotation })
  }
  return next
}

function transformOf(document: EditorDocument): Transform | undefined {
  if (document.crop === null && document.resize === null) {
    return undefined
  }
  return {
    ...(document.crop !== null && { crop: document.crop }),
    ...(document.resize !== null && { resize: document.resize }),
  }
}

function baseName(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(0, dot) : fileName
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}

/**
 * Single-photo editor: choose a photo (or use the sample), apply a library
 * preset, adjust its placement and style for this photo, crop, resize, and
 * download. Every step is undoable.
 */
export function Editor({ organizationId, initialPresetId }: EditorProps) {
  const [history, dispatch] = useReducer(editorReducer, undefined, () => createHistory())
  const document = history.present
  const [tool, setTool] = useState<Tool>('watermark')
  const [aspectId, setAspectId] = useState('free')
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null)
  const displaySize = useElementSize(imageElement)
  const presets = useQuery(watermarksQueryOptions(organizationId))

  const sourceSize = photo?.size ?? SAMPLE_SIZE
  const isCropping = tool === 'crop'
  const renderSpec = isCropping ? PHOTO_ONLY_SPEC : (document.spec ?? PHOTO_ONLY_SPEC)
  const renderTransform = isCropping ? undefined : transformOf(document)
  const { result, isRendering, error, renderer, setSubject } = useRenderer(
    organizationId,
    renderSpec,
    renderTransform,
  )

  // Load the preset named in the URL once the library has arrived.
  const initialPreset = presets.data?.find((candidate) => candidate.id === initialPresetId)
  useEffect(() => {
    if (initialPreset !== undefined && document.spec === null) {
      dispatch({
        type: 'reset',
        document: { ...document, spec: initialPreset.spec, presetId: initialPreset.id },
      })
    }
  }, [initialPreset, document])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || isEditableTarget(event.target)) {
        return
      }
      const key = event.key.toLowerCase()
      if (key === 'z' && event.shiftKey) {
        event.preventDefault()
        dispatch({ type: 'redo' })
      } else if (key === 'z') {
        event.preventDefault()
        dispatch({ type: 'undo' })
      } else if (key === 'y') {
        event.preventDefault()
        dispatch({ type: 'redo' })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  async function choosePhoto(file: File) {
    try {
      const size = await readImageSize(file)
      setPhoto({ file, size })
      setPhotoError(null)
      setAspectId('free')
      dispatch({ type: 'reset', document: { ...document, crop: null, resize: null } })
      await setSubject(file)
    } catch {
      setPhotoError('That file is not an image the browser can read.')
    }
  }

  async function restoreSample() {
    setPhoto(null)
    setAspectId('free')
    dispatch({ type: 'reset', document: { ...document, crop: null, resize: null } })
    await setSubject(null)
  }

  function commit(patch: Partial<EditorDocument>) {
    dispatch({ type: 'commit', document: { ...document, ...patch } })
  }

  function markGesture(gesture: MarkGesture) {
    if (document.spec === null) {
      return
    }
    const next = { ...document, spec: applyMarkPatch(document.spec, gesture.patch) }
    switch (gesture.phase) {
      case 'start': {
        dispatch({ type: 'checkpoint' })

        break
      }
      case 'move': {
        dispatch({ type: 'set', document: next })

        break
      }
      case 'commit': {
        dispatch({ type: 'commit', document: next })

        break
      }
      // No default
    }
  }

  function cropGesture(gesture: CropGesture) {
    if (gesture.phase === 'start') {
      dispatch({ type: 'checkpoint' })
    } else if (gesture.phase === 'move' && gesture.crop !== undefined) {
      dispatch({ type: 'set', document: { ...document, crop: gesture.crop } })
    } else if (gesture.phase === 'commit' && gesture.crop !== undefined) {
      commit({ crop: gesture.crop })
    }
  }

  function choosePreset(preset: WatermarkDto) {
    commit({ spec: preset.spec, presetId: preset.id })
  }

  async function exportPhoto(options: EncodeOptions) {
    const current = renderer.current
    if (current === null || document.spec === null) {
      return
    }
    setIsExporting(true)
    setExportError(null)
    try {
      const blob = await current.exportFull(document.spec, options, transformOf(document))
      const name = photo === null ? 'sample-photo' : baseName(photo.file.name)
      downloadBlob(blob, `${name}-watermarked.${FORMAT_EXTENSIONS[options.format]}`)
    } catch (error_) {
      setExportError(describeError(error_))
    } finally {
      setIsExporting(false)
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    if (file !== undefined) {
      void choosePhoto(file)
    }
  }

  const cropBase = croppedSize(sourceSize, document.crop)
  const outputSize = document.resize ?? cropBase
  const crop: CropRect = document.crop ?? fullCrop(sourceSize)
  const aspectPreset = ASPECT_PRESETS.find((candidate) => candidate.id === aspectId)
  const cropRatio = aspectPreset === undefined ? null : resolveRatio(aspectPreset, sourceSize)
  const isShowMarkOverlay =
    tool === 'watermark' &&
    document.spec !== null &&
    !document.spec.style.tiling.enabled &&
    result !== null
  const previewSize: Size | null =
    result === null ? null : { width: result.width, height: result.height }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_PHOTO_TYPES}
            aria-label="Open a photo"
            className="sr-only"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              if (file !== undefined) {
                void choosePhoto(file)
              }
              event.currentTarget.value = ''
            }}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              inputRef.current?.click()
            }}
          >
            <ImagePlus aria-hidden="true" className="size-4" />
            Open photo
          </Button>
          {photo === null ? null : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                void restoreSample()
              }}
            >
              <RotateCcw aria-hidden="true" className="size-4" />
              Sample photo
            </Button>
          )}
          <span className="truncate text-sm text-ink-muted">
            {photo === null ? 'Sample scene' : photo.file.name} · {String(sourceSize.width)} ×{' '}
            {String(sourceSize.height)} px
          </span>
          <div className="ml-auto flex items-center gap-1">
            {isRendering ? <Spinner className="size-4" label="Rendering" /> : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Undo"
              aria-keyshortcuts="Control+Z"
              disabled={!canUndo(history)}
              onClick={() => {
                dispatch({ type: 'undo' })
              }}
            >
              <Undo2 aria-hidden="true" className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Redo"
              aria-keyshortcuts="Control+Shift+Z Control+Y"
              disabled={!canRedo(history)}
              onClick={() => {
                dispatch({ type: 'redo' })
              }}
            >
              <Redo2 aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </div>
        <div
          onDragOver={(event) => {
            event.preventDefault()
          }}
          onDrop={onDrop}
          className="relative flex min-h-72 items-center justify-center overflow-hidden rounded-card border border-line bg-[repeating-conic-gradient(var(--color-line)_0%_25%,transparent_0%_50%)] bg-[length:20px_20px]"
        >
          {result === null ? (
            <Spinner className="size-6" label="Rendering preview" />
          ) : (
            <div className="relative">
              <img
                ref={setImageElement}
                src={result.url}
                alt={isCropping ? 'Photo with the crop frame' : 'Photo with the watermark applied'}
                width={result.width}
                height={result.height}
                className="block max-h-[70vh] max-w-full"
              />
              {isShowMarkOverlay && previewSize !== null && document.spec !== null ? (
                <MarkOverlay
                  placement={result.placement}
                  previewSize={previewSize}
                  displaySize={displaySize}
                  scale={document.spec.style.scale}
                  rotation={document.spec.style.rotation}
                  onGesture={markGesture}
                />
              ) : null}
              {isCropping ? (
                <CropOverlay
                  crop={crop}
                  source={sourceSize}
                  displaySize={displaySize}
                  ratio={cropRatio}
                  onGesture={cropGesture}
                />
              ) : null}
            </div>
          )}
        </div>
        <p className="text-xs text-ink-muted" aria-live="polite">
          {document.spec === null
            ? 'Choose a preset to place a watermark. Drop a photo anywhere on the canvas.'
            : `Output ${String(outputSize.width)} × ${String(outputSize.height)} px.`}
        </p>
        {photoError === null ? null : <Alert tone="error">{photoError}</Alert>}
        {error === null ? null : (
          <Alert tone="error" title="Preview failed">
            {error}
          </Alert>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <Tabs.Root
          value={tool}
          onValueChange={(value) => {
            if (isTool(value)) {
              setTool(value)
            }
          }}
          className="flex flex-col gap-4"
        >
          <Tabs.List
            aria-label="Editor tools"
            className="grid grid-cols-4 gap-1 rounded-lg border border-line bg-surface-raised p-1"
          >
            {TOOLS.map(({ value, label, icon: Icon }) => (
              <Tabs.Trigger
                key={value}
                value={value}
                className="flex flex-col items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-ink-muted outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 data-[state=active]:bg-brand-600 data-[state=active]:text-white"
              >
                <Icon aria-hidden="true" className="size-4" />
                {label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          <Tabs.Content value="watermark" className="outline-none">
            <WatermarkPanel
              organizationId={organizationId}
              presetId={document.presetId}
              spec={document.spec}
              onPresetChange={choosePreset}
              onSpecChange={(spec) => {
                commit({ spec })
              }}
            />
          </Tabs.Content>
          <Tabs.Content value="crop" className="outline-none">
            <CropPanel
              source={sourceSize}
              crop={document.crop}
              aspectId={aspectId}
              onAspectChange={setAspectId}
              onCropChange={(next) => {
                commit({ crop: next })
              }}
            />
          </Tabs.Content>
          <Tabs.Content value="resize" className="outline-none">
            <ResizePanel
              base={cropBase}
              resize={document.resize}
              onResizeChange={(next) => {
                commit({ resize: next })
              }}
            />
          </Tabs.Content>
          <Tabs.Content value="export" className="outline-none">
            <ExportPanel
              outputSize={outputSize}
              isReady={document.spec !== null}
              isExporting={isExporting}
              onExport={(options) => {
                void exportPhoto(options)
              }}
            />
            {exportError === null ? null : (
              <Alert tone="error" title="Export failed" className="mt-3">
                {exportError}
              </Alert>
            )}
          </Tabs.Content>
        </Tabs.Root>
      </Card>
    </div>
  )
}
