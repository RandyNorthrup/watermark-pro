import { ImagePlus, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { WatermarkSpec } from '../../../shared/watermark'
import { INK } from '../../engine/contrast'
import { apiRequest } from '../../lib/api'
import { describeError } from '../../lib/errors'
import { assetFileUrl } from '../../lib/library'
import { PreviewRenderer, type PreviewResult } from '../../lib/preview'
import { SampleScene } from '../sample-scene'
import { Alert } from '../ui/alert'
import { Button } from '../ui/button'
import { Spinner } from '../ui/spinner'

interface PreviewPanelProps {
  organizationId: string
  spec: WatermarkSpec
}

/** Slider drags fire continuously; one render per pause keeps the worker responsive. */
const RENDER_DEBOUNCE_MS = 120
const ACCEPTED_PHOTO_TYPES = 'image/png,image/jpeg,image/webp,image/avif,image/gif'

function isRenderable(spec: WatermarkSpec): boolean {
  return spec.kind !== 'image' || spec.assetId !== ''
}

function describePlacement(result: PreviewResult): string {
  const mark = result.marks[0]
  if (mark === undefined) {
    return 'Nothing to place.'
  }
  const ink =
    mark.contrast.isAuto || mark.contrast.fill === INK[mark.contrast.variant].fill
      ? `${mark.contrast.variant} ink`
      : `ink ${mark.contrast.fill}`
  const anchor = mark.placement.anchor
  if (anchor === null) {
    return `Custom position, ${ink}.`
  }
  return `Placed ${anchor.replaceAll('-', ' ')}, ${ink}.`
}

/** What the preview area shows before the engine's first frame. */
function PendingPreview({
  isRenderable: isSpecRenderable,
  hasOwnPhoto,
}: {
  isRenderable: boolean
  hasOwnPhoto: boolean
}) {
  if (!isSpecRenderable) {
    return (
      <p className="p-6 text-center text-sm text-ink-muted">
        Choose or upload a logo to see the preview.
      </p>
    )
  }
  if (hasOwnPhoto) {
    return <Spinner className="size-6" label="Rendering preview" />
  }
  return <SampleScene className="max-h-[70vh] w-full object-contain" />
}

/**
 * Renders the current spec over a subject photo through the engine worker.
 * Uses a bundled sample scene until the user drops in a photo of their own.
 */
export function PreviewPanel({ organizationId, spec }: PreviewPanelProps) {
  const rendererRef = useRef<PreviewRenderer | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<PreviewResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isRendering, setIsRendering] = useState(false)
  const [hasOwnPhoto, setHasOwnPhoto] = useState(false)
  const [subjectVersion, setSubjectVersion] = useState(0)

  useEffect(() => {
    const renderer = new PreviewRenderer(async (assetId) => {
      const response = await apiRequest(assetFileUrl(organizationId, assetId))
      return await response.blob()
    })
    rendererRef.current = renderer
    return () => {
      renderer.dispose()
      rendererRef.current = null
    }
  }, [organizationId])

  useEffect(() => {
    if (!isRenderable(spec)) {
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
  }, [spec, subjectVersion])

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

  return (
    <section aria-labelledby="preview-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="preview-heading" className="text-sm font-semibold">
          Preview
        </h2>
        <div className="flex items-center gap-2">
          {isRendering ? <Spinner className="size-4" label="Rendering preview" /> : null}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_PHOTO_TYPES}
            className="sr-only"
            aria-label="Choose a photo to preview on"
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
            variant="secondary"
            size="sm"
            onClick={() => {
              inputRef.current?.click()
            }}
          >
            <ImagePlus aria-hidden="true" className="size-4" />
            Try your photo
          </Button>
          {hasOwnPhoto ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                void changeSubject(null)
              }}
            >
              <RotateCcw aria-hidden="true" className="size-4" />
              Sample photo
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex min-h-64 items-center justify-center overflow-hidden rounded-card border border-line bg-[repeating-conic-gradient(var(--color-line)_0%_25%,transparent_0%_50%)] bg-[length:20px_20px]">
        {shownResult === null ? (
          <PendingPreview isRenderable={isRenderable(spec)} hasOwnPhoto={hasOwnPhoto} />
        ) : (
          <img
            src={shownResult.url}
            alt="Watermark preview on the subject photo"
            width={shownResult.width}
            height={shownResult.height}
            className="max-h-[70vh] w-full object-contain"
          />
        )}
      </div>
      {shownResult === null ? null : (
        <p className="text-xs text-ink-muted" aria-live="polite">
          {describePlacement(shownResult)}
        </p>
      )}
      {error === null ? null : (
        <Alert tone="error" title="Preview failed">
          {error}
        </Alert>
      )}
    </section>
  )
}
