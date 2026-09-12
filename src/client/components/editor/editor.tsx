import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Crop,
  Download,
  Eraser,
  ImagePlus,
  LibraryBig,
  Link2,
  Redo2,
  RotateCcw,
  Scaling,
  SlidersHorizontal,
  Stamp,
  Undo2,
} from 'lucide-react'
import { Tabs } from 'radix-ui'
import { type DragEvent, useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import { AdjustPanel } from './adjust-panel'
import { CropOverlay, type CropGesture } from './crop-overlay'
import { CropPanel } from './crop-panel'
import { ExportPanel } from './export-panel'
import { FORMAT_EXTENSIONS } from './formats'
import { FrameControls } from './frame-controls'
import { MarkOverlay, type MarkGesture, type MarkPatch } from './mark-overlay'
import { OrientationControls } from './orientation-controls'
import { PresetPanel } from './preset-panel'
import { ResizePanel } from './resize-panel'
import { useRenderer } from './use-renderer'
import { WatermarkPanel } from './watermark-panel'
import {
  type Adjustments,
  IDENTITY_ADJUSTMENTS,
  IDENTITY_ORIENTATION,
  type Orientation,
} from '../../../shared/adjustments'
import type { WatermarkDto } from '../../../shared/api-watermark'
import type { WatermarkSpec } from '../../../shared/watermark'
import {
  ASPECT_PRESETS,
  type CropRect,
  croppedSize,
  fullCrop,
  resolveRatio,
} from '../../editor/geometry'
import {
  EDITOR_SESSION_SAVE_DELAY_MS,
  loadEditorSession,
  saveEditorSession,
} from '../../editor/session'
import {
  canRedo,
  canUndo,
  createHistory,
  createLayer,
  type EditorDocument,
  editorReducer,
  EMPTY_DOCUMENT,
  isEmptyDocument,
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
import type { CloudUpload } from '../../lib/imports/source'
import { subscribeLaunchFiles } from '../../lib/launch-consumer'
import { watermarksQueryOptions } from '../../lib/library'
import { captureOfflineOwner } from '../../lib/offline-context'
import { readPhotoMetadata } from '../../lib/photo-metadata'
import { publicConfigQueryOptions } from '../../lib/queries'
import { noteRecentWork } from '../../lib/recent-work-events'
import { SAMPLE_PHOTO_HEIGHT, SAMPLE_PHOTO_WIDTH } from '../../lib/sample-photo'
import { shareFile } from '../../lib/share-file'
import { blankSpec, withPlacement, withStyle } from '../../lib/spec-edit'
import { baseName, SAMPLE_FILE_NAME } from '../../lib/spec-tokens'
import { useElementSize } from '../../lib/use-element-size'
import { useDesignHistory } from '../designer/use-design-history'
import { CloudImportButtons } from '../import/cloud-import-buttons'
import { TakePhotoButton } from '../import/take-photo-button'
import { UrlImportDialog } from '../import/url-import-dialog'
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
  /** The workspace name; seeds the export panel's default invisible-mark message. */
  organizationName: string
  /** Preset to load when the editor opens (from the library's "Open in editor"). */
  initialPresetId?: string | null | undefined
  /** Whether the current member may store photos in the gallery. */
  canSave?: boolean | undefined
  canCreatePresets?: boolean | undefined
  /** When set, the editor runs embedded in the bulk override dialog. */
  embedded?: EmbeddedEditing | undefined
}

type Tool = 'presets' | 'watermark' | 'crop' | 'adjust' | 'resize' | 'export'

const TOOLS = [
  { value: 'presets', label: 'editor.tabs.presets', icon: LibraryBig },
  { value: 'watermark', label: 'editor.tabs.watermark', icon: Stamp },
  { value: 'crop', label: 'editor.tabs.crop', icon: Crop },
  { value: 'adjust', label: 'editor.tabs.adjust', icon: SlidersHorizontal },
  { value: 'resize', label: 'editor.tabs.resize', icon: Scaling },
  { value: 'export', label: 'editor.tabs.export', icon: Download },
] as const satisfies readonly { value: Tool; label: string; icon: typeof Stamp }[]

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
  const { t } = useTranslation()
  return hasPhoto ? (
    <Spinner className="size-6" label={t('editor.renderingPreview')} />
  ) : (
    <SampleScene className="max-h-[42svh] lg:max-h-[70vh] lg:max-w-none" />
  )
}

/**
 * Single-photo editor: choose a photo (or use the sample), apply a library
 * preset, adjust its placement and style for this photo, crop, resize, and
 * download. Every step is undoable.
 */
export function Editor(props: EditorProps) {
  return <EditorSession key={props.organizationId} {...props} />
}

function EditorSession({
  organizationId,
  organizationName,
  initialPresetId,
  canSave = false,
  canCreatePresets = false,
  embedded,
}: EditorProps) {
  const { t } = useTranslation()
  const [history, dispatch] = useReducer(editorReducer, undefined, () =>
    createHistory(embedded?.document),
  )
  const document = history.present
  const draft = useDesignHistory(blankSpec())
  const resetDraft = draft.reset
  const [tool, setTool] = useState<Tool>('watermark')
  const [activeLayerId, setActiveLayerId] = useState<string | null>(() =>
    canCreatePresets && embedded === undefined && initialPresetId == null ? 'draft' : null,
  )
  // The active layer: the chosen one while it exists, else the topmost.
  const activeLayer: Layer | null =
    activeLayerId === 'draft'
      ? null
      : (document.layers.find((layer) => layer.id === activeLayerId) ??
        document.layers.at(-1) ??
        null)
  const [aspectId, setAspectId] = useState('free')
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [sessionRestored, setSessionRestored] = useState(
    embedded !== undefined || (initialPresetId !== null && initialPresetId !== undefined),
  )
  const [isExporting, setIsExporting] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [cloudSaved, setCloudSaved] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const save = useMutation({
    networkMode: 'always',
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
  const photoRequest = useRef(0)
  const appliedInitialPreset = useRef<string | null>(null)
  useEffect(
    () => () => {
      photoRequest.current += 1
    },
    [],
  )
  const subjectIdentity = photoRequest.current
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null)
  const displaySize = useElementSize(imageElement)
  const presets = useQuery(watermarksQueryOptions(organizationId))
  const publicConfig = useQuery(publicConfigQueryOptions)

  const sourceSize = photo?.size ?? SAMPLE_SIZE
  const isCropping = tool === 'crop'
  const cropBaseSize = cropSpace(sourceSize, document.orientation)
  const canvasLayers =
    canCreatePresets && activeLayerId === 'draft'
      ? [...document.layers, { id: 'draft', presetId: '', spec: draft.value }]
      : document.layers
  const renderLayers = isCropping
    ? []
    : canvasLayers.filter((layer) => layer.spec.kind !== 'image' || layer.spec.assetId !== '')
  const renderSpecs = renderLayers.map((layer) => layer.spec)
  const renderTransform = previewTransform(document, isCropping)
  const cropBase = croppedSize(cropBaseSize, document.crop)
  const outputSize = framedSize(document.resize ?? cropBase, document.border)
  const { result, isRendering, error, renderer, setSubject } = useRenderer(
    organizationId,
    renderSpecs,
    renderTransform,
    outputSize,
  )

  useEffect(() => {
    if (sessionRestored || embedded !== undefined) return
    const controller = new AbortController()
    const isCurrent = () => !controller.signal.aborted
    void (async () => {
      try {
        const restored = await loadEditorSession(organizationId)
        if (!isCurrent()) return
        if (restored !== null) {
          dispatch({ type: 'reset', document: restored.document })
          resetDraft(restored.draftSpec)
          const activeLayerId =
            restored.activeLayerId === 'draft' ||
            restored.document.layers.some((layer) => layer.id === restored.activeLayerId)
              ? restored.activeLayerId
              : null
          setActiveLayerId(activeLayerId)
          if (restored.photo !== null) {
            const restoredPhoto = {
              file: restored.photo.file,
              size: restored.photo.dimensions,
            }
            setPhoto(restoredPhoto)
            const metadata = await readPhotoMetadata(restoredPhoto.file)
            if (!isCurrent()) return
            await setSubject(restoredPhoto.file, metadata)
          }
        }
        if (isCurrent()) setSessionRestored(true)
      } catch (restoreError) {
        if (isCurrent()) {
          setSessionError(describeError(restoreError))
          setSessionRestored(true)
        }
      }
    })()
    return () => controller.abort()
  }, [embedded, organizationId, resetDraft, sessionRestored, setSubject])

  useEffect(() => {
    if (
      !sessionRestored ||
      embedded !== undefined ||
      (initialPresetId !== null && initialPresetId !== undefined)
    )
      return
    let isActive = true
    const timer = window.setTimeout(() => {
      void saveEditorSession(
        organizationId,
        document,
        draft.value,
        activeLayer?.id ?? (activeLayerId === 'draft' ? 'draft' : null),
        photo === null ? null : { file: photo.file, dimensions: photo.size },
      )
        .then(() => {
          if (isActive) setSessionError(null)
        })
        .catch((saveError: unknown) => {
          if (isActive) setSessionError(describeError(saveError))
        })
    }, EDITOR_SESSION_SAVE_DELAY_MS)
    return () => {
      isActive = false
      window.clearTimeout(timer)
    }
  }, [
    activeLayer?.id,
    activeLayerId,
    document,
    draft.value,
    embedded,
    initialPresetId,
    organizationId,
    photo,
    sessionRestored,
  ])

  const visibleTools =
    embedded === undefined ? TOOLS : TOOLS.filter((entry) => entry.value !== 'export')

  // Load the preset named in the URL once the library has arrived (not embedded).
  const initialPreset = presets.data?.find((candidate) => candidate.id === initialPresetId)
  useEffect(() => {
    if (
      embedded !== undefined ||
      initialPreset === undefined ||
      document.layers.length > 0 ||
      appliedInitialPreset.current === initialPreset.id
    )
      return
    appliedInitialPreset.current = initialPreset.id
    dispatch({
      type: 'reset',
      document: { ...document, layers: [createLayer(initialPreset.id, initialPreset.spec)] },
    })
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
        setPhotoError(t('editor.notAnImage'))
      }
    })()
    return () => {
      live.current = false
    }
  }, [embeddedFile, setSubject, t])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || isEditableTarget(event.target)) {
        return
      }
      const key = event.key.toLowerCase()
      if (key === 'z' && event.shiftKey) {
        event.preventDefault()
        redo()
      } else if (key === 'z') {
        event.preventDefault()
        undo()
      } else if (key === 'y') {
        event.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  })

  const choosePhoto = useCallback(
    async (file: File) => {
      const owner = captureOfflineOwner()
      photoRequest.current += 1
      const request = photoRequest.current
      const assertCurrent = () => {
        owner.assertCurrent()
        if (request !== photoRequest.current) throw new Error('The photo selection changed.')
      }
      try {
        const [size, metadata] = await Promise.all([readImageSize(file), readPhotoMetadata(file)])
        assertCurrent()
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
        try {
          assertCurrent()
        } catch {
          return
        }
        setPhotoError(t('editor.notAnImage'))
      }
    },
    [document, setSubject, t],
  )

  // Subscribe as well as draining on mount: an installed app can receive a new
  // OS launch while this route is already open. Embedded editors never consume it.
  useEffect(() => {
    if (embedded !== undefined) return
    return subscribeLaunchFiles('/app/editor', ([launched]) => {
      if (launched !== undefined) void choosePhoto(launched)
    })
  }, [choosePhoto, embedded])

  async function restoreSample() {
    photoRequest.current += 1
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

  function undo() {
    if (activeLayerId === 'draft' && draft.canUndo) draft.undo()
    else dispatch({ type: 'undo' })
  }
  function redo() {
    if (activeLayerId === 'draft' && draft.canRedo) draft.redo()
    else dispatch({ type: 'redo' })
  }

  function clearCanvas() {
    if (activeLayerId === 'draft') resetDraft(blankSpec())
    else if (!isEmptyDocument(document)) dispatch({ type: 'commit', document: EMPTY_DOCUMENT })
    setActiveLayerId(null)
    setAspectId('free')
    setTool('watermark')
  }

  function markGesture(layerId: string, gesture: MarkGesture) {
    if (layerId === 'draft') {
      switch (gesture.phase) {
        case 'start': {
          draft.begin()
          break
        }
        case 'move':
        case 'commit': {
          draft.change(applyMarkPatch(draft.value, gesture.patch))
          break
        }
        case 'end': {
          {
            draft.end()
            // No default
          }
          break
        }
      }
      return
    }
    const layer = document.layers.find((candidate) => candidate.id === layerId)
    if (layer === undefined) {
      return
    }
    const next = withLayer(document, {
      ...layer,
      spec: applyMarkPatch(layer.spec, gesture.patch),
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
    noteRecentWork(organizationId, { kind: 'preset', preset })
    const layer = createLayer(preset.id, preset.spec)
    commit({ layers: [...document.layers, layer] })
    setActiveLayerId(layer.id)
    setTool('watermark')
  }

  function removeLayer(layerId: string) {
    commit(withoutLayer(document, layerId))
  }

  function changeActiveSpec(spec: WatermarkSpec) {
    if (activeLayer === null) {
      setActiveLayerId('draft')
      draft.change(spec)
    } else {
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

  /**
   * Renders the current photo at full resolution and returns it as a cloud
   * upload (or null when nothing is loaded), so the "Save to cloud" buttons can
   * write the exact bytes the Download button would produce.
   */
  async function exportBlob(options: EncodeOptions): Promise<CloudUpload | null> {
    const current = renderer.current
    if (current === null || document.layers.length === 0) {
      return null
    }
    const blob = await current.exportFull(
      layerSpecs(document),
      options,
      documentTransform(document),
      outputSize,
    )
    return { name: exportFileName(options.format), blob }
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
    const dragTypes: unknown = Reflect.get(event.dataTransfer, 'types')
    if (Array.isArray(dragTypes) && dragTypes.length > 0 && !dragTypes.includes('Files')) return
    const file = event.dataTransfer.files[0]
    if (file !== undefined) {
      void choosePhoto(file)
    }
  }

  const crop: CropRect = document.crop ?? fullCrop(cropBaseSize)
  const aspectPreset = ASPECT_PRESETS.find((candidate) => candidate.id === aspectId)
  const cropRatio = aspectPreset === undefined ? null : resolveRatio(aspectPreset, cropBaseSize)
  const previewSize: Size | null =
    result === null ? null : { width: result.width, height: result.height }
  const canUndoCurrent = activeLayerId === 'draft' ? draft.canUndo : canUndo(history)
  const canRedoCurrent = activeLayerId === 'draft' ? draft.canRedo : canRedo(history)
  const canClearCanvas = activeLayerId === 'draft' || !isEmptyDocument(document)

  return (
    <div className="app-scroll-region grid max-w-full gap-4 overflow-x-auto pb-2 lg:grid-cols-[max-content_22rem] lg:gap-6">
      <Card className="flex flex-col gap-3 p-3 lg:w-max lg:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_PHOTO_TYPES}
            aria-label={t('editor.openPhotoLabel')}
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
            {t('editor.openPhoto')}
          </Button>
          {embedded === undefined ? (
            <>
              <TakePhotoButton
                onCapture={(file) => {
                  void choosePhoto(file)
                }}
              />
              <UrlImportDialog
                organizationId={organizationId}
                onImport={(file) => {
                  void choosePhoto(file)
                }}
                trigger={
                  <Button type="button" variant="secondary" size="sm">
                    <Link2 aria-hidden="true" className="size-4" />
                    {t('editor.fromLink')}
                  </Button>
                }
              />
              {publicConfig.data === undefined ? null : (
                <CloudImportButtons
                  config={publicConfig.data}
                  onImport={(files) => {
                    // The editor works on one photo at a time; take the first.
                    const first = files[0]
                    if (first !== undefined) {
                      void choosePhoto(first)
                    }
                  }}
                  onError={(message) => {
                    setPhotoError(message)
                  }}
                />
              )}
            </>
          ) : null}
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
              {t('editor.samplePhoto')}
            </Button>
          )}
          <span className="truncate text-sm text-ink-muted">
            {t('editor.photoMeta', {
              name: photo === null ? t('editor.sampleScene') : photo.file.name,
              width: sourceSize.width,
              height: sourceSize.height,
            })}
          </span>
          <div className="ms-auto flex items-center gap-1">
            {isRendering ? <Spinner className="size-4" label={t('editor.rendering')} /> : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('editor.undo')}
              aria-keyshortcuts="Control+Z"
              disabled={!canUndoCurrent}
              onClick={() => {
                undo()
              }}
            >
              <Undo2 aria-hidden="true" className="size-4 rtl:-scale-x-100" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('editor.redo')}
              aria-keyshortcuts="Control+Shift+Z Control+Y"
              disabled={!canRedoCurrent}
              onClick={() => {
                redo()
              }}
            >
              <Redo2 aria-hidden="true" className="size-4 rtl:-scale-x-100" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('editor.clearCanvas')}
              title={t('editor.clearCanvas')}
              disabled={!canClearCanvas}
              onClick={clearCanvas}
            >
              <Eraser aria-hidden="true" className="size-4" />
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
                draggable={false}
                onDragStart={(event) => event.preventDefault()}
                src={result.url}
                alt={t(isCropping ? 'editor.altCrop' : 'editor.altWatermark')}
                width={result.width}
                height={result.height}
                className="block h-auto max-h-[42svh] w-auto max-w-full lg:max-h-[70vh] lg:max-w-none"
              />
              {tool === 'watermark' && previewSize !== null
                ? renderLayers.map((layer, index) => {
                    const outcome = result.marks[index]
                    if (outcome === undefined || layer.spec.style.tiling.enabled) return null
                    return (
                      <MarkOverlay
                        key={`${organizationId}:${String(subjectIdentity)}:${layer.id}:${layer.spec.kind}`}
                        placement={outcome.placement}
                        position={layer.spec.placement}
                        renderedScale={result.specs?.[index]?.style.scale}
                        previewSize={previewSize}
                        displaySize={displaySize}
                        scale={layer.spec.style.scale}
                        rotation={layer.spec.style.rotation}
                        margin={layer.spec.style.margin}
                        active={layer.id === (activeLayer?.id ?? 'draft')}
                        onSelect={() => {
                          setActiveLayerId(layer.id)
                        }}
                        onGesture={(gesture) => {
                          markGesture(layer.id, gesture)
                        }}
                      />
                    )
                  })
                : null}
              {isCropping ? (
                <CropOverlay
                  key={`${organizationId}:${String(subjectIdentity)}`}
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
        <div className="flex flex-col gap-1 text-xs text-ink-muted" aria-live="polite">
          <p>
            {document.layers.length === 0
              ? t(canCreatePresets ? 'editor.watermark.firstUseHint' : 'editor.choosePresetHint')
              : t('editor.outputSize', { width: outputSize.width, height: outputSize.height })}
          </p>
          {tool === 'watermark' &&
          activeLayer !== null &&
          !activeLayer.spec.style.tiling.enabled ? (
            <p>{t('editor.mark.position')}</p>
          ) : null}
        </div>
        {photoError === null ? null : <Alert tone="error">{photoError}</Alert>}
        {sessionError === null ? null : <Alert tone="error">{sessionError}</Alert>}
        {error === null ? null : (
          <Alert tone="error" title={t('editor.previewFailed')}>
            {error}
          </Alert>
        )}
      </Card>

      <Card className="min-w-0 overflow-hidden p-0">
        <div className="app-scroll-region flex max-h-[75svh] min-w-0 flex-col gap-4 overflow-y-auto overscroll-contain p-6 lg:max-h-[calc(100svh-8rem)]">
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
              aria-label={t('editor.toolsLabel')}
              className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface-raised p-1"
            >
              {visibleTools.map(({ value, label, icon: Icon }) => (
                <Tabs.Trigger
                  key={value}
                  value={value}
                  className="flex min-w-0 flex-col items-center gap-1 rounded-lg px-2 py-2 text-xs font-medium text-ink-muted outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 data-[state=active]:bg-brand-600 data-[state=active]:text-white"
                >
                  <Icon aria-hidden="true" className="size-4" />
                  {t(label)}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            <Tabs.Content value="presets" className="outline-none">
              <PresetPanel
                organizationId={organizationId}
                canCreate={canCreatePresets}
                layers={document.layers}
                activeLayerId={activeLayer?.id ?? null}
                onAddPreset={addPreset}
                onNewPreset={() => {
                  setActiveLayerId('draft')
                  setTool('watermark')
                }}
                onSelectLayer={(layerId) => {
                  setActiveLayerId(layerId)
                  setTool('watermark')
                }}
                onRemoveLayer={removeLayer}
              />
            </Tabs.Content>
            <Tabs.Content value="watermark" className="outline-none">
              <WatermarkPanel
                organizationId={organizationId}
                canCreate={canCreatePresets}
                draftSpec={draft.value}
                undo={undo}
                redo={redo}
                canUndo={canUndoCurrent}
                canRedo={canRedoCurrent}
                layers={document.layers}
                activeLayerId={activeLayer?.id ?? null}
                onAddPreset={addPreset}
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
                  organizationName={organizationName}
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
                  cloudConfig={publicConfig.data}
                  onExportBlob={exportBlob}
                  onCloudSaved={(message) => {
                    setExportError(null)
                    setCloudSaved(message)
                  }}
                  onCloudError={(message) => {
                    setCloudSaved(null)
                    setExportError(message)
                  }}
                />
                {exportError === null ? null : (
                  <Alert tone="error" title={t('editor.exportFailed')} className="mt-3">
                    {exportError}
                  </Alert>
                )}
                {saved === null ? null : (
                  <Alert tone="success" className="mt-3">
                    <Trans
                      i18nKey="editor.savedToGallery"
                      values={{ name: saved }}
                      components={{
                        galleryLink: <Link to="/app/gallery" className="font-medium underline" />,
                      }}
                    />
                  </Alert>
                )}
                {cloudSaved === null ? null : (
                  <Alert tone="success" className="mt-3">
                    {cloudSaved}
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
                {t('editor.applyToPhoto')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={document.layers.length === 0}
                onClick={() => {
                  embedded.onApplyToAll(document)
                }}
              >
                {t('editor.applyToAll')}
              </Button>
              {embedded.hasOverride ? (
                <Button type="button" variant="secondary" onClick={embedded.onRemove}>
                  {t('editor.removeOverride')}
                </Button>
              ) : null}
              <Button type="button" variant="ghost" onClick={embedded.onCancel}>
                {t('editor.cancel')}
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
