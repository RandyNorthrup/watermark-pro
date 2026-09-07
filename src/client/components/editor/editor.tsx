import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Crop,
  Download,
  ImagePlus,
  Redo2,
  RotateCcw,
  Scaling,
  SlidersHorizontal,
  Stamp,
  Undo2,
} from 'lucide-react'
import { Tabs } from 'radix-ui'
import { type DragEvent, useEffect, useReducer, useRef, useState } from 'react'

import { AdjustPanel } from './adjust-panel'
import { CropOverlay, type CropGesture } from './crop-overlay'
import { CropPanel } from './crop-panel'
import { ExportPanel } from './export-panel'
import { FORMAT_EXTENSIONS } from './formats'
import { FrameControls } from './frame-controls'
import { MarkOverlay, type MarkGesture, type MarkPatch } from './mark-overlay'
import { OrientationControls } from './orientation-controls'
import { ResizePanel } from './resize-panel'
import { useRenderer } from './use-renderer'
import { WatermarkPanel } from './watermark-panel'
import {
  type Adjustments,
  IDENTITY_ADJUSTMENTS,
  IDENTITY_ORIENTATION,
  type Orientation,
} from '../../../shared/adjustments'
import type { WatermarkDto } from '../../../shared/api'
import type { WatermarkSpec } from '../../../shared/watermark'
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
  createLayer,
  type EditorDocument,
  editorReducer,
  type Layer,
  MAX_LAYERS,
  withAdjustments,
  withLayer,
  withoutLayer,
  withOrientation,
} from '../../editor/state'
import { documentTransform, previewTransform } from '../../editor/transform'
import type { EncodeOptions } from '../../engine/encode'
import type { Size } from '../../engine/layout'
import { orientedFrame } from '../../engine/orient'
import type { Border } from '../../engine/pipeline'
import { downloadBlob } from '../../lib/download'
import { describeError } from '../../lib/errors'
import { galleryQueryKey, uploadPhoto } from '../../lib/gallery'
import { readImageSize } from '../../lib/image-size'
import { watermarksQueryOptions } from '../../lib/library'
import { readPhotoMetadata } from '../../lib/photo-metadata'
import { SAMPLE_PHOTO_HEIGHT, SAMPLE_PHOTO_WIDTH } from '../../lib/sample-photo'
import { shareFile } from '../../lib/share-file'
import { withPlacement, withStyle } from '../../lib/spec-edit'
import { baseName, SAMPLE_FILE_NAME } from '../../lib/spec-tokens'
import { useElementSize } from '../../lib/use-element-size'
import { SampleScene } from '../sample-scene'
import { Alert } from '../ui/alert'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { Spinner } from '../ui/spinner'

/** Editing one photo of a bulk batch inside a dialog: no export, a footer instead. */
export interface EmbeddedEditing {
  document: EditorDocument
  file: File
  hasOverride: boolean
  onApply: (document: EditorDocument) => void
  onApplyToAll: (document: EditorDocument) => void
  onRemove: () => void
  onCancel: () => void
}

interface EditorProps {
  organizationId: string
  /** Preset to load when the editor opens (from the library's "Open in editor"). */
  initialPresetId?: string | null | undefined
  /** Whether the current member may store photos in the gallery. */
  canSave?: boolean | undefined
  /** When set, the editor runs embedded in the bulk override dialog. */
  embedded?: EmbeddedEditing | undefined
}

type Tool = 'watermark' | 'crop' | 'adjust' | 'resize' | 'export'

const TOOLS: readonly { value: Tool; label: string; icon: typeof Stamp }[] = [
  { value: 'watermark', label: 'Watermark', icon: Stamp },
  { value: 'crop', label: 'Crop', icon: Crop },
  { value: 'adjust', label: 'Adjust', icon: SlidersHorizontal },
  { value: 'resize', label: 'Resize', icon: Scaling },
  { value: 'export', label: 'Export', icon: Download },
]

const ACCEPTED_PHOTO_TYPES = 'image/png,image/jpeg,image/webp,image/avif,image/gif'
const SAMPLE_SIZE: Size = { width: SAMPLE_PHOTO_WIDTH, height: SAMPLE_PHOTO_HEIGHT }

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

function layerSpecs(document: EditorDocument): WatermarkSpec[] {
  return document.layers.map((layer) => layer.spec)
}

/** The output size after an optional matte frame is added around the photo. */
function framedSize(photo: Size, border: Border | null): Size {
  if (border === null || border.width <= 0) {
    return photo
  }
  const offset = Math.round(border.width * Math.min(photo.width, photo.height))
  return { width: photo.width + offset * 2, height: photo.height + offset * 2 }
}

/** The oriented, straightened frame the crop is drawn in, floored to whole pixels. */
function cropSpace(source: Size, orientation: Orientation): Size {
  const frame = orientedFrame(source, orientation)
  return {
    width: Math.max(1, Math.floor(frame.width)),
    height: Math.max(1, Math.floor(frame.height)),
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}

/** Before the first frame: the sample scene itself, or a spinner while a chosen photo renders. */
function PendingPreview({ hasPhoto }: { hasPhoto: boolean }) {
  return hasPhoto ? (
    <Spinner className="size-6" label="Rendering preview" />
  ) : (
    <SampleScene className="max-h-[42svh] lg:max-h-[70vh]" />
  )
}

/**
 * Single-photo editor: choose a photo (or use the sample), apply a library
 * preset, adjust its placement and style for this photo, crop, resize, and
 * download. Every step is undoable.
 */
export function Editor({
  organizationId,
  initialPresetId,
  canSave = false,
  embedded,
}: EditorProps) {
  const [history, dispatch] = useReducer(editorReducer, undefined, () =>
    createHistory(embedded?.document),
  )
  const document = history.present
  const [tool, setTool] = useState<Tool>('watermark')
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null)
  // The active layer: the chosen one while it exists, else the topmost.
  const activeLayer: Layer | null =
    document.layers.find((layer) => layer.id === activeLayerId) ?? document.layers.at(-1) ?? null
  const activeIndex = activeLayer === null ? -1 : document.layers.indexOf(activeLayer)
  const [aspectId, setAspectId] = useState('free')
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: async (options: EncodeOptions) => {
      const current = renderer.current
      const first = document.layers[0]
      if (current === null || first === undefined) {
        throw new Error('choose a preset first')
      }
      const blob = await current.exportFull(
        layerSpecs(document),
        options,
        documentTransform(document),
        outputSize,
      )
      return await uploadPhoto(organizationId, {
        blob,
        name: exportFileName(options.format),
        width: outputSize.width,
        height: outputSize.height,
        presetId: first.presetId,
      })
    },
    onMutate: () => {
      setExportError(null)
      setSaved(null)
    },
    onSuccess: async (stored) => {
      setSaved(stored.name)
      await queryClient.invalidateQueries({ queryKey: galleryQueryKey(organizationId) })
    },
    onError: (error) => {
      setExportError(describeError(error))
    },
  })
  const inputRef = useRef<HTMLInputElement>(null)
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null)
  const displaySize = useElementSize(imageElement)
  const presets = useQuery(watermarksQueryOptions(organizationId))

  const sourceSize = photo?.size ?? SAMPLE_SIZE
  const isCropping = tool === 'crop'
  const cropBaseSize = cropSpace(sourceSize, document.orientation)
  const renderSpecs = isCropping ? [] : layerSpecs(document)
  const renderTransform = previewTransform(document, isCropping)
  const cropBase = croppedSize(cropBaseSize, document.crop)
  const outputSize = framedSize(document.resize ?? cropBase, document.border)
  const { result, isRendering, error, renderer, setSubject } = useRenderer(
    organizationId,
    renderSpecs,
    renderTransform,
    outputSize,
  )

  const visibleTools =
    embedded === undefined ? TOOLS : TOOLS.filter((entry) => entry.value !== 'export')

  // Load the preset named in the URL once the library has arrived (not embedded).
  const initialPreset = presets.data?.find((candidate) => candidate.id === initialPresetId)
  useEffect(() => {
    if (embedded === undefined && initialPreset !== undefined && document.layers.length === 0) {
      dispatch({
        type: 'reset',
        document: { ...document, layers: [createLayer(initialPreset.id, initialPreset.spec)] },
      })
    }
  }, [embedded, initialPreset, document])

  // Embedded mode edits one batch photo: load it without resetting the document.
  const embeddedFile = embedded?.file ?? null
  useEffect(() => {
    if (embeddedFile === null) {
      return
    }
    // Read through a property so a stale async result can be dropped without
    // TypeScript narrowing the flag to a constant across the await.
    const live = { current: true }
    void (async () => {
      try {
        const [size, metadata] = await Promise.all([
          readImageSize(embeddedFile),
          readPhotoMetadata(embeddedFile),
        ])
        if (!live.current) {
          return
        }
        setPhoto({ file: embeddedFile, size })
        await setSubject(embeddedFile, metadata)
      } catch {
        setPhotoError('That file is not an image the browser can read.')
      }
    })()
    return () => {
      live.current = false
    }
  }, [embeddedFile, setSubject])

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
      const [size, metadata] = await Promise.all([readImageSize(file), readPhotoMetadata(file)])
      setPhoto({ file, size })
      setPhotoError(null)
      setAspectId('free')
      dispatch({
        type: 'reset',
        document: {
          ...document,
          orientation: IDENTITY_ORIENTATION,
          crop: null,
          resize: null,
          adjust: IDENTITY_ADJUSTMENTS,
          border: null,
        },
      })
      await setSubject(file, metadata)
    } catch {
      setPhotoError('That file is not an image the browser can read.')
    }
  }

  async function restoreSample() {
    setPhoto(null)
    setAspectId('free')
    dispatch({
      type: 'reset',
      document: {
        ...document,
        orientation: IDENTITY_ORIENTATION,
        crop: null,
        resize: null,
        adjust: IDENTITY_ADJUSTMENTS,
        border: null,
      },
    })
    await setSubject(null)
  }

  function commit(patch: Partial<EditorDocument>) {
    dispatch({ type: 'commit', document: { ...document, ...patch } })
  }

  function markGesture(gesture: MarkGesture) {
    if (activeLayer === null) {
      return
    }
    const next = withLayer(document, {
      ...activeLayer,
      spec: applyMarkPatch(activeLayer.spec, gesture.patch),
    })
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

  /** Adds the preset as the topmost layer and makes it the active one. */
  function addPreset(preset: WatermarkDto) {
    if (document.layers.length >= MAX_LAYERS) {
      return
    }
    const layer = createLayer(preset.id, preset.spec)
    commit({ layers: [...document.layers, layer] })
    setActiveLayerId(layer.id)
  }

  function removeLayer(layerId: string) {
    commit(withoutLayer(document, layerId))
  }

  function changeActiveSpec(spec: WatermarkSpec) {
    if (activeLayer !== null) {
      commit(withLayer(document, { ...activeLayer, spec }))
    }
  }

  function changeOrientation(orientation: Orientation) {
    dispatch({ type: 'commit', document: withOrientation(document, orientation, sourceSize) })
  }

  function changeAdjust(adjust: Adjustments) {
    dispatch({ type: 'commit', document: withAdjustments(document, adjust) })
  }

  function changeBorder(border: Border | null) {
    commit({ border })
  }

  /** Renders at full size and hands the file to `deliver`; failures show in the export panel. */
  async function produce(
    options: EncodeOptions,
    setIsBusy: (isBusy: boolean) => void,
    deliver: (blob: Blob, fileName: string) => Promise<void> | void,
  ) {
    const current = renderer.current
    if (current === null || document.layers.length === 0) {
      return
    }
    setIsBusy(true)
    setExportError(null)
    setSaved(null)
    try {
      const blob = await current.exportFull(
        layerSpecs(document),
        options,
        documentTransform(document),
        outputSize,
      )
      await deliver(blob, exportFileName(options.format))
    } catch (error_) {
      setExportError(describeError(error_))
    } finally {
      setIsBusy(false)
    }
  }

  function exportPhoto(options: EncodeOptions) {
    return produce(options, setIsExporting, downloadBlob)
  }

  /** The share sheet is its own feedback; a dismissed sheet needs no message. */
  function sharePhoto(options: EncodeOptions) {
    return produce(options, setIsSharing, async (blob, fileName) => {
      await shareFile(blob, fileName)
    })
  }

  function exportFileName(format: EncodeOptions['format']): string {
    const name = photo === null ? SAMPLE_FILE_NAME : baseName(photo.file.name)
    return `${name}-watermarked.${FORMAT_EXTENSIONS[format]}`
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    if (file !== undefined) {
      void choosePhoto(file)
    }
  }

  const crop: CropRect = document.crop ?? fullCrop(cropBaseSize)
  const aspectPreset = ASPECT_PRESETS.find((candidate) => candidate.id === aspectId)
  const cropRatio = aspectPreset === undefined ? null : resolveRatio(aspectPreset, cropBaseSize)
  const activeOutcome = result?.marks[activeIndex]
  const isShowMarkOverlay =
    tool === 'watermark' &&
    activeLayer !== null &&
    !activeLayer.spec.style.tiling.enabled &&
    activeOutcome !== undefined
  const previewSize: Size | null =
    result === null ? null : { width: result.width, height: result.height }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem] lg:gap-6">
      <Card className="flex flex-col gap-3 p-3 lg:p-4">
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
          className="relative flex min-h-48 items-center justify-center overflow-hidden rounded-card border border-line bg-[repeating-conic-gradient(var(--color-line)_0%_25%,transparent_0%_50%)] bg-[length:20px_20px] lg:min-h-72"
        >
          {result === null ? (
            <PendingPreview hasPhoto={photo !== null} />
          ) : (
            <div className="relative">
              <img
                ref={setImageElement}
                src={result.url}
                alt={isCropping ? 'Photo with the crop frame' : 'Photo with the watermark applied'}
                width={result.width}
                height={result.height}
                className="block max-h-[42svh] max-w-full lg:max-h-[70vh]"
              />
              {isShowMarkOverlay && previewSize !== null ? (
                <MarkOverlay
                  placement={activeOutcome.placement}
                  previewSize={previewSize}
                  displaySize={displaySize}
                  scale={activeLayer.spec.style.scale}
                  rotation={activeLayer.spec.style.rotation}
                  margin={activeLayer.spec.style.margin}
                  onGesture={markGesture}
                />
              ) : null}
              {isCropping ? (
                <CropOverlay
                  crop={crop}
                  source={cropBaseSize}
                  displaySize={displaySize}
                  ratio={cropRatio}
                  onGesture={cropGesture}
                />
              ) : null}
            </div>
          )}
        </div>
        <p className="text-xs text-ink-muted" aria-live="polite">
          {document.layers.length === 0
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
            className={`grid ${embedded === undefined ? 'grid-cols-5' : 'grid-cols-4'} gap-1 rounded-lg border border-line bg-surface-raised p-1`}
          >
            {visibleTools.map(({ value, label, icon: Icon }) => (
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
              layers={document.layers}
              activeLayerId={activeLayer?.id ?? null}
              onAddPreset={addPreset}
              onSelectLayer={setActiveLayerId}
              onRemoveLayer={removeLayer}
              onSpecChange={changeActiveSpec}
            />
          </Tabs.Content>
          <Tabs.Content value="crop" className="flex flex-col gap-4 outline-none">
            <OrientationControls
              orientation={document.orientation}
              onChange={changeOrientation}
              showStraighten
            />
            <CropPanel
              source={cropBaseSize}
              crop={document.crop}
              aspectId={aspectId}
              onAspectChange={setAspectId}
              onCropChange={(next) => {
                commit({ crop: next })
              }}
            />
          </Tabs.Content>
          <Tabs.Content value="adjust" className="flex flex-col gap-4 outline-none">
            <AdjustPanel
              adjust={document.adjust}
              onChange={changeAdjust}
              photoFile={photo?.file ?? null}
            />
            <FrameControls border={document.border} onChange={changeBorder} />
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
          {embedded === undefined ? (
            <Tabs.Content value="export" className="outline-none">
              <ExportPanel
                outputSize={outputSize}
                isReady={document.layers.length > 0}
                isExporting={isExporting}
                onExport={(options) => {
                  void exportPhoto(options)
                }}
                onShare={(options) => {
                  void sharePhoto(options)
                }}
                isSharing={isSharing}
                onSave={canSave ? save.mutate : undefined}
                isSaving={save.isPending}
              />
              {exportError === null ? null : (
                <Alert tone="error" title="Export failed" className="mt-3">
                  {exportError}
                </Alert>
              )}
              {saved === null ? null : (
                <Alert tone="success" className="mt-3">
                  Saved {saved} to the{' '}
                  <Link to="/app/gallery" className="font-medium underline">
                    gallery
                  </Link>
                  .
                </Alert>
              )}
            </Tabs.Content>
          ) : null}
        </Tabs.Root>
        {embedded === undefined ? null : (
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <Button
              type="button"
              disabled={document.layers.length === 0}
              onClick={() => {
                embedded.onApply(document)
              }}
            >
              Apply to this photo
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={document.layers.length === 0}
              onClick={() => {
                embedded.onApplyToAll(document)
              }}
            >
              Apply to all photos
            </Button>
            {embedded.hasOverride ? (
              <Button type="button" variant="secondary" onClick={embedded.onRemove}>
                Remove override
              </Button>
            ) : null}
            <Button type="button" variant="ghost" onClick={embedded.onCancel}>
              Cancel
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}
