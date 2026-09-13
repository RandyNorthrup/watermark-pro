import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { describeError } from '../../lib/errors'
import { specForPhoto } from '../../lib/spec-tokens'
import { PdfReader, type PdfPagePreview } from '../../pdf/reader'
import { MarkOverlay } from '../editor/mark-overlay'
import { MediaViewport } from '../editor/media-viewport'
import type { MediaScene } from '../editor/use-media-scene'
import { useRenderer } from '../editor/use-renderer'
import { Alert } from '../ui/alert'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Spinner } from '../ui/spinner'

/** Real paged PDF preview with the same watermark engine and touch handles as Image. */
export function DocumentViewer({
  file,
  organizationId,
  scene,
}: {
  file: File
  organizationId: string
  scene: MediaScene
}) {
  const { t } = useTranslation()
  const [reader, setReader] = useState<PdfReader | null>(null)
  const [page, setPage] = useState(1)
  const [preview, setPreview] = useState<{ page: number; value: PdfPagePreview } | null>(null)
  const [prepared, setPrepared] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const current = preview?.page === page ? preview.value : null
  const size = current?.size ?? { width: 1, height: 1 }
  const renderer = useRenderer(
    organizationId,
    scene.renderLayers.map((layer) => specForPhoto(layer.spec, file, { output: size })),
    undefined,
    current?.pixels ?? size,
    current !== null && prepared === current.file,
  )
  const { setSubject } = renderer

  useEffect(() => {
    let isActive = true
    let opened: PdfReader | null = null
    void PdfReader.open(file)
      .then(async (value) => {
        opened = value
        if (isActive) setReader(value)
        else await value.close()
      })
      .catch((error: unknown) => {
        if (isActive) setError(describeError(error))
      })
    return () => {
      isActive = false
      if (opened !== null) void opened.close()
    }
  }, [file])

  useEffect(() => {
    if (reader === null) return
    const controller = new AbortController()
    void reader
      .render(page, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) {
          return
        }

        setPreview({ page, value })
        setError(null)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setError(describeError(error))
      })
    return () => controller.abort()
  }, [reader, page])

  useEffect(() => {
    if (current === null) return
    let isActive = true
    void setSubject(current.file).then(() => {
      if (isActive) setPrepared(current.file)
    })
    return () => {
      isActive = false
    }
  }, [current, setSubject])

  const result = current !== null && prepared === current.file ? renderer.result : null
  const label = t('documents.reader.pageStatus', {
    name: file.name,
    page,
    total: reader?.pageCount ?? 0,
  })
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('documents.reader.previous')}
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </Button>
        <label className="flex items-center gap-2 text-sm">
          {t('documents.reader.page')}
          <Input
            type="number"
            min={1}
            max={reader?.pageCount ?? 1}
            value={page}
            onChange={(event) => {
              const next = event.currentTarget.valueAsNumber
              if (
                reader !== null &&
                Number.isSafeInteger(next) &&
                next >= 1 &&
                next <= reader.pageCount
              )
                setPage(next)
            }}
            className="w-16 rounded-lg border border-control-line bg-surface-raised px-2 py-1 text-center"
          />
        </label>
        <span className="text-sm text-ink-muted">
          {t('documents.reader.ofPages', { total: reader?.pageCount ?? 0 })}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('documents.reader.next')}
          disabled={reader === null || page >= reader.pageCount}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </Button>
      </div>
      {error === null ? null : <Alert tone="error">{error}</Alert>}
      {renderer.error === null ? null : <Alert tone="error">{renderer.error}</Alert>}
      <MediaViewport size={size} isReady={current !== null}>
        {({ displaySize, gridSpacing }) =>
          result === null ? (
            <Spinner label={t('editor.renderingPreview')} />
          ) : (
            <>
              <img
                src={result.url}
                alt={t('documents.reader.preview', { page })}
                draggable={false}
                onDragStart={(event) => event.preventDefault()}
                width={result.width}
                height={result.height}
                className="block h-full w-full max-w-none"
              />
              {scene.renderLayers.map((layer, index) => {
                const outcome = result.marks[index]
                if (outcome === undefined || layer.spec.style.tiling.enabled) return null
                return (
                  <MarkOverlay
                    key={layer.id}
                    placement={outcome.placement}
                    position={layer.spec.placement}
                    previewSize={result}
                    displaySize={displaySize}
                    scale={layer.spec.style.scale}
                    rotation={layer.spec.style.rotation}
                    margin={layer.spec.style.margin}
                    gridSpacing={gridSpacing}
                    active={layer.id === scene.value.activeId}
                    onSelect={() => scene.select(layer.id)}
                    onGesture={(gesture) => scene.gesture(layer.id, gesture)}
                  />
                )
              })}
            </>
          )
        }
      </MediaViewport>
      <div className="flex min-w-0 gap-3 overflow-hidden text-xs whitespace-nowrap text-ink-muted">
        <p className="min-w-0 flex-1 truncate" title={t('editor.mark.position')}>
          {t('editor.mark.position')}
        </p>
        <p className="ms-auto max-w-[45%] truncate text-end" title={label}>
          {label}
        </p>
      </div>
      {current !== null && current.text !== '' ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-ink-muted">
            {t('documents.reader.pageText')}
          </summary>
          <p className="mt-2 whitespace-pre-wrap">{current.text}</p>
        </details>
      ) : null}
    </div>
  )
}
