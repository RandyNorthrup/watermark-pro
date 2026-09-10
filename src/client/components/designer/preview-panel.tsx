import { ImagePlus, RotateCcw } from 'lucide-react'
import { type DragEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { Anchor, WatermarkSpec } from '../../../shared/watermark'
import { INK } from '../../engine/contrast'
import { describeError } from '../../lib/errors'
import { assetFileUrl } from '../../lib/library'
import { loadWorkspaceMedia } from '../../lib/offline-media'
import { PreviewRenderer, type PreviewResult } from '../../lib/preview'
import { withPlacement, withStyle } from '../../lib/spec-edit'
import { useElementSize } from '../../lib/use-element-size'
import { MarkOverlay, type MarkGesture } from '../editor/mark-overlay'
import { SampleScene } from '../sample-scene'
import { Alert } from '../ui/alert'
import { Button } from '../ui/button'
import { Spinner } from '../ui/spinner'

interface PreviewPanelProps {
  organizationId: string
  spec: WatermarkSpec
  initialPhoto?: File | undefined
  onSpecChange?: ((spec: WatermarkSpec) => void) | undefined
}

/** Slider drags fire continuously; one render per pause keeps the worker responsive. */
const RENDER_DEBOUNCE_MS = 120
const ACCEPTED_PHOTO_TYPES = 'image/png,image/jpeg,image/webp,image/avif,image/gif'

function isRenderable(spec: WatermarkSpec): boolean {
  return spec.kind !== 'image' || spec.assetId !== ''
}

/** Catalogue keys for the lower-case position phrase in the placement readout. */
const PLACED_POSITION_KEYS = {
  'top-left': 'designer.preview.position.topLeft',
  'top-center': 'designer.preview.position.topCenter',
  'top-right': 'designer.preview.position.topRight',
  'middle-left': 'designer.preview.position.middleLeft',
  center: 'designer.preview.position.center',
  'middle-right': 'designer.preview.position.middleRight',
  'bottom-left': 'designer.preview.position.bottomLeft',
  'bottom-center': 'designer.preview.position.bottomCenter',
  'bottom-right': 'designer.preview.position.bottomRight',
} as const satisfies Record<Anchor, string>

/** What the preview area shows before the engine's first frame. */
function PendingPreview({
  isRenderable: isSpecRenderable,
  hasOwnPhoto,
}: {
  isRenderable: boolean
  hasOwnPhoto: boolean
}) {
  const { t } = useTranslation()
  if (!isSpecRenderable) {
    return (
      <p className="p-6 text-center text-sm text-ink-muted">{t('designer.preview.chooseLogo')}</p>
    )
  }
  if (hasOwnPhoto) {
    return <Spinner className="size-6" label={t('designer.preview.rendering')} />
  }
  return <SampleScene className="max-h-[70vh] w-full object-contain" />
}

/**
 * Renders the current spec over a subject photo through the engine worker.
 * Uses a bundled sample scene until the user drops in a photo of their own.
 */
export function PreviewPanel({
  organizationId,
  spec,
  initialPhoto,
  onSpecChange,
}: PreviewPanelProps) {
  const { t } = useTranslation()
  const rendererRef = useRef<PreviewRenderer | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null)
  const displaySize = useElementSize(imageElement)
  const [result, setResult] = useState<PreviewResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isRendering, setIsRendering] = useState(false)
  const [hasOwnPhoto, setHasOwnPhoto] = useState(initialPhoto !== undefined)
  const [preparedPhoto, setPreparedPhoto] = useState<File | undefined>(undefined)
  const isSubjectReady = initialPhoto === undefined || preparedPhoto === initialPhoto
  const [subjectVersion, setSubjectVersion] = useState(0)

  useEffect(() => {
    let isActive = true
    const renderer = new PreviewRenderer(async (assetId) => {
      return await loadWorkspaceMedia(organizationId, assetFileUrl(organizationId, assetId))
    })
    rendererRef.current = renderer
    if (initialPhoto !== undefined) {
      const photo = initialPhoto
      async function preparePhoto() {
        try {
          await renderer.setSubject(photo)
          if (isActive) {
            setPreparedPhoto(photo)
            setHasOwnPhoto(true)
          }
        } catch (error_) {
          if (isActive) setError(describeError(error_))
        }
      }
      void preparePhoto()
    }
    return () => {
      isActive = false
      renderer.dispose()
      rendererRef.current = null
    }
  }, [organizationId, initialPhoto])

  useEffect(() => {
    if (!isSubjectReady || !isRenderable(spec)) {
      return
    }
    async function renderFrame(renderer: PreviewRenderer) {
      try {
        const next = await renderer.render(spec)
        if (next === null) {
          return
        }
        setResult(next)
        setError(null)
        setIsRendering(false)
      } catch (error_) {
        setError(describeError(error_))
        setIsRendering(false)
      }
    }
    const timer = setTimeout(() => {
      const renderer = rendererRef.current
      if (renderer === null) {
        return
      }
      setIsRendering(true)
      void renderFrame(renderer)
    }, RENDER_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [spec, subjectVersion, isSubjectReady])

  // Each object URL lives until the next result replaces it or the panel unmounts.
  useEffect(
    () => () => {
      if (result !== null) {
        URL.revokeObjectURL(result.url)
      }
    },
    [result],
  )

  // A logo mark without a logo has nothing to show; a frame left over from
  // the previous mark would misrepresent it, so the hint takes its place.
  const shownResult = isRenderable(spec) ? result : null

  async function changeSubject(file: File | null) {
    const renderer = rendererRef.current
    if (renderer === null) {
      return
    }
    try {
      await renderer.setSubject(file)
      setHasOwnPhoto(file !== null)
      setSubjectVersion((version) => version + 1)
    } catch (error_) {
      setError(describeError(error_))
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    if (initialPhoto !== undefined) return
    const file = event.dataTransfer.files[0]
    if (file !== undefined) void changeSubject(file)
  }

  function changePlacement(gesture: MarkGesture) {
    if (onSpecChange === undefined) return
    let next = spec
    if (gesture.patch.x !== undefined && gesture.patch.y !== undefined) {
      next = withPlacement(next, {
        mode: 'custom',
        x: gesture.patch.x,
        y: gesture.patch.y,
      })
    }
    if (gesture.patch.scale !== undefined) {
      next = withStyle(next, { scale: gesture.patch.scale })
    }
    if (gesture.patch.rotation !== undefined) {
      next = withStyle(next, { rotation: gesture.patch.rotation })
    }
    if (next !== spec) onSpecChange(next)
  }

  /** One-line readout of where the top mark landed and which ink it uses. */
  function describePlacement(result: PreviewResult): string {
    const mark = result.marks[0]
    if (mark === undefined) {
      return t('designer.preview.nothingToPlace')
    }
    const ink =
      mark.contrast.isAuto || mark.contrast.fill === INK[mark.contrast.variant].fill
        ? t(
            mark.contrast.variant === 'light'
              ? 'designer.preview.inkLight'
              : 'designer.preview.inkDark',
          )
        : t('designer.preview.inkColour', { colour: mark.contrast.fill })
    const anchor = mark.placement.anchor
    if (anchor === null) {
      return t('designer.preview.customPosition', { ink })
    }
    return t('designer.preview.placed', { position: t(PLACED_POSITION_KEYS[anchor]), ink })
  }

  return (
    <section aria-labelledby="preview-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="preview-heading" className="text-sm font-semibold">
          {t('designer.preview.heading')}
        </h2>
        <div className="flex items-center gap-2">
          {isRendering ? (
            <Spinner className="size-4" label={t('designer.preview.rendering')} />
          ) : null}
          <input
            ref={inputRef}
            hidden={initialPhoto !== undefined}
            type="file"
            accept={ACCEPTED_PHOTO_TYPES}
            className="sr-only"
            aria-label={t('designer.preview.choosePhoto')}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              if (file !== undefined) {
                void changeSubject(file)
              }
              event.currentTarget.value = ''
            }}
          />
          <Button
            type="button"
            hidden={initialPhoto !== undefined}
            variant="secondary"
            size="sm"
            onClick={() => {
              inputRef.current?.click()
            }}
          >
            <ImagePlus aria-hidden="true" className="size-4" />
            {t('designer.preview.tryYourPhoto')}
          </Button>
          {hasOwnPhoto && initialPhoto === undefined ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                void changeSubject(null)
              }}
            >
              <RotateCcw aria-hidden="true" className="size-4" />
              {t('designer.preview.samplePhoto')}
            </Button>
          ) : null}
        </div>
      </div>
      <div
        onDragOver={(event) => {
          event.preventDefault()
        }}
        onDrop={onDrop}
        className="flex min-h-64 items-center justify-center overflow-hidden rounded-card border border-line bg-[repeating-conic-gradient(var(--color-line)_0%_25%,transparent_0%_50%)] bg-[length:20px_20px]"
      >
        {shownResult === null ? (
          <PendingPreview isRenderable={isRenderable(spec)} hasOwnPhoto={hasOwnPhoto} />
        ) : (
          <div className="relative">
            <img
              ref={setImageElement}
              src={shownResult.url}
              alt={t('designer.preview.alt')}
              width={shownResult.width}
              height={shownResult.height}
              className="block max-h-[70vh] max-w-full object-contain"
            />
            {onSpecChange === undefined || spec.style.tiling.enabled
              ? null
              : (() => {
                  const outcome = shownResult.marks[0]
                  if (outcome === undefined) return null
                  return (
                    <MarkOverlay
                      placement={outcome.placement}
                      previewSize={{ width: shownResult.width, height: shownResult.height }}
                      displaySize={displaySize}
                      scale={spec.style.scale}
                      rotation={spec.style.rotation}
                      margin={spec.style.margin}
                      onGesture={changePlacement}
                    />
                  )
                })()}
          </div>
        )}
      </div>
      {shownResult === null ? null : (
        <div className="flex flex-col gap-1 text-xs text-ink-muted">
          <p aria-live="polite">{describePlacement(shownResult)}</p>
          {onSpecChange === undefined || spec.style.tiling.enabled ? null : (
            <p>{t('editor.mark.position')}</p>
          )}
        </div>
      )}
      {error === null ? null : (
        <Alert tone="error" title={t('designer.preview.failed')}>
          {error}
        </Alert>
      )}
    </section>
  )
}
