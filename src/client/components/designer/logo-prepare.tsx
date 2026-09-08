import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DEFAULT_BACKGROUND_TOLERANCE, MAX_BACKGROUND_TOLERANCE } from '../../../shared/constants'
import { mainThreadBackend } from '../../lib/canvas-backend'
import { describeError } from '../../lib/errors'
import { readImageSize } from '../../lib/image-size'
import type { PixelBuffer } from '../../lib/logo-cleanup'
import { describeSize, hasAlpha, runCleanup, toPngName } from '../../lib/logo-prepare-pipeline'
import { Alert } from '../ui/alert'
import { Button } from '../ui/button'
import { SliderField } from '../ui/slider-field'

/** The tolerance slider moves in whole colour-distance units. */
const TOLERANCE_STEP = 1

/** Turns a cleaned buffer back into the ImageData a canvas paints. */
function toImageData(buffer: PixelBuffer): ImageData {
  // Copy into a fresh ArrayBuffer-backed array: TS 6 types ImageData's data as
  // Uint8ClampedArray<ArrayBuffer>, which a plain Uint8ClampedArray is not.
  return new ImageData(new Uint8ClampedArray(buffer.data), buffer.width, buffer.height)
}

/**
 * Decodes a file to a plain RGBA buffer on a main-thread canvas. Browser-only:
 * neither `createImageBitmap` nor `getImageData` exist in jsdom, so this rejects
 * there and the panel falls back to a preview-less mode.
 */
async function decodePixels(file: File): Promise<PixelBuffer> {
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = mainThreadBackend().createCanvas(bitmap.width, bitmap.height)
    canvas.context.drawImage(bitmap, 0, 0)
    const image = canvas.context.getImageData(0, 0, canvas.width, canvas.height)
    return { data: image.data, width: image.width, height: image.height }
  } finally {
    bitmap.close()
  }
}

interface LogoPrepareProps {
  /** The file the user chose; the panel prepares and hands back a PNG. */
  file: File
  /** Receives the prepared PNG, ready to upload. */
  onPrepared: (file: File) => void
  onCancel: () => void
  /** Whether the upload the prepared file feeds is in flight. */
  isSaving: boolean
}

/**
 * Sits between choosing a logo file and uploading it: optionally clears a flat
 * background and trims transparent margins, previews the result, then re-encodes
 * to a transparent PNG. The pixel decisions run through the pure pipeline
 * helpers; the decode and encode here are thin canvas wrappers that only run in
 * the browser.
 */
export function LogoPrepare({ file, onPrepared, onCancel, isSaving }: LogoPrepareProps) {
  const { t } = useTranslation()
  const [source, setSource] = useState<PixelBuffer | null>(null)
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null)
  const [remove, setRemove] = useState(false)
  const [tolerance, setTolerance] = useState(DEFAULT_BACKGROUND_TOLERANCE)
  const [trim, setTrim] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const afterCanvasRef = useRef<HTMLCanvasElement>(null)

  const sourceUrl = useMemo(() => URL.createObjectURL(file), [file])
  useEffect(() => {
    return () => {
      URL.revokeObjectURL(sourceUrl)
    }
  }, [sourceUrl])

  useEffect(() => {
    let isActive = true
    // Read through a call so a post-await check is not narrowed to a constant.
    const isStillActive = () => isActive
    async function load() {
      setError(null)
      setSource(null)
      setRemove(false)
      setTrim(false)
      let size
      try {
        size = await readImageSize(file)
      } catch {
        if (isStillActive()) {
          setSourceSize(null)
          setError(t('designer.notAnImage'))
        }
        return
      }
      if (!isStillActive()) {
        return
      }
      setSourceSize(size)
      try {
        const pixels = await decodePixels(file)
        if (isStillActive()) {
          setSource(pixels)
          setTrim(hasAlpha(pixels))
        }
      } catch {
        // No canvas (jsdom, or a browser without one): keep the preview-less mode.
      }
    }
    void load()
    return () => {
      isActive = false
    }
  }, [file, t])

  const cleaned = useMemo(() => {
    if (source === null) {
      return null
    }
    return runCleanup(source, { removeBackground: remove, tolerance, trim })
  }, [source, remove, tolerance, trim])

  useEffect(() => {
    const canvas = afterCanvasRef.current
    if (canvas === null || cleaned === null || cleaned.width === 0) {
      return
    }
    const context = canvas.getContext('2d')
    if (context === null) {
      return
    }
    canvas.width = cleaned.width
    canvas.height = cleaned.height
    context.putImageData(toImageData(cleaned), 0, 0)
  }, [cleaned])

  const outputSize = cleaned ?? sourceSize

  async function buildPreparedFile(): Promise<File> {
    const name = toPngName(file.name)
    const backend = mainThreadBackend()
    if (cleaned !== null && cleaned.width > 0 && cleaned.height > 0) {
      const canvas = backend.createCanvas(cleaned.width, cleaned.height)
      canvas.context.putImageData(toImageData(cleaned), 0, 0)
      const blob = await canvas.encode({ format: 'image/png', quality: 1 })
      return new File([blob], name, { type: 'image/png' })
    }
    const bitmap = await createImageBitmap(file)
    try {
      const canvas = backend.createCanvas(bitmap.width, bitmap.height)
      canvas.context.drawImage(bitmap, 0, 0)
      const blob = await canvas.encode({ format: 'image/png', quality: 1 })
      return new File([blob], name, { type: 'image/png' })
    } finally {
      bitmap.close()
    }
  }

  async function applyLogo() {
    setError(null)
    try {
      onPrepared(await buildPreparedFile())
    } catch (error_) {
      setError(describeError(error_))
    }
  }

  const isReady = error === null && sourceSize !== null

  return (
    <section
      aria-label={t('designer.logo.prepare.region')}
      className="flex flex-col gap-4 rounded-lg border border-line bg-surface-raised p-4"
    >
      <div>
        <p className="text-sm font-medium">
          {t('designer.logo.prepare.title', { name: file.name })}
        </p>
        <p className="mt-1 text-xs text-ink-muted">{t('designer.logo.prepare.description')}</p>
      </div>

      {isReady ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <figure className="flex flex-col gap-1">
              <figcaption className="text-xs font-medium text-ink-muted">
                {t('designer.logo.prepare.before')}
              </figcaption>
              <span className="flex h-24 items-center justify-center rounded-md bg-[repeating-conic-gradient(var(--color-line)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]">
                <img src={sourceUrl} alt="" className="max-h-20 max-w-full object-contain" />
              </span>
            </figure>
            <figure className="flex flex-col gap-1">
              <figcaption className="text-xs font-medium text-ink-muted">
                {t('designer.logo.prepare.after')}
              </figcaption>
              <span className="flex h-24 items-center justify-center rounded-md bg-[repeating-conic-gradient(var(--color-line)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]">
                {source === null ? (
                  <span className="text-xs text-ink-muted">
                    {t('designer.logo.prepare.previewNeedsCanvas')}
                  </span>
                ) : (
                  <canvas
                    ref={afterCanvasRef}
                    aria-label={t('designer.logo.prepare.preview')}
                    className="max-h-20 max-w-full object-contain"
                  />
                )}
              </span>
            </figure>
          </div>

          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={remove}
              onChange={(event) => {
                setRemove(event.currentTarget.checked)
              }}
              className="size-4 accent-brand-600"
            />
            <span className="font-medium">{t('designer.logo.prepare.removeBackground')}</span>
          </label>
          <SliderField
            label={t('designer.logo.prepare.backgroundTolerance')}
            value={tolerance}
            min={0}
            max={MAX_BACKGROUND_TOLERANCE}
            step={TOLERANCE_STEP}
            disabled={!remove}
            onChange={setTolerance}
          />
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={trim}
              onChange={(event) => {
                setTrim(event.currentTarget.checked)
              }}
              className="size-4 accent-brand-600"
            />
            <span className="font-medium">{t('designer.logo.prepare.trim')}</span>
          </label>

          {outputSize === null ? null : (
            <p className="text-xs text-ink-muted">
              {t('designer.logo.prepare.outputSize', {
                size: describeSize(outputSize.width, outputSize.height),
              })}
            </p>
          )}
        </>
      ) : null}

      {error === null ? null : <Alert tone="error">{error}</Alert>}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          isPending={isSaving}
          disabled={!isReady}
          onClick={() => {
            void applyLogo()
          }}
        >
          {t('designer.logo.prepare.use')}
        </Button>
        <Button type="button" variant="secondary" disabled={isSaving} onClick={onCancel}>
          {t('designer.logo.prepare.chooseAnother')}
        </Button>
      </div>
    </section>
  )
}
