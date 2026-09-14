import { useQuery } from '@tanstack/react-query'
import { Download, FileText, Share2, X } from 'lucide-react'
import { type DragEvent, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DocumentViewer } from './document-viewer'
import { MAX_PDF_BYTES } from '../../../shared/constants'
import { downloadBlob } from '../../lib/download'
import { describeError } from '../../lib/errors'
import { assetFileUrl } from '../../lib/library'
import { captureOfflineGeneration, captureOfflineOwner } from '../../lib/offline-context'
import { loadWorkspaceMedia } from '../../lib/offline-media'
import { publicConfigQueryOptions } from '../../lib/queries'
import { canShareFiles, shareFile } from '../../lib/share-file'
import { baseName } from '../../lib/spec-tokens'
import { processDocument } from '../../pdf/process-document'
import { MediaEditorLayout, MediaHistory, MediaTools } from '../editor/media-tools'
import { useMediaScene } from '../editor/use-media-scene'
import { CloudImportButtons } from '../import/cloud-import-buttons'
import { CloudSaveButtons } from '../import/cloud-save-buttons'
import { Alert } from '../ui/alert'
import { Button } from '../ui/button'
import { Card } from '../ui/card'

interface DocumentsToolProps {
  organizationId: string
  canCreatePresets?: boolean
}

/** Inline PDF editor; original pages remain editable/searchable in the exported PDF. */
export function DocumentsTool({ organizationId, canCreatePresets = false }: DocumentsToolProps) {
  const { t } = useTranslation()
  const scene = useMediaScene(canCreatePresets)
  const [identity] = useState(captureOfflineGeneration)
  const config = useQuery(publicConfigQueryOptions)
  const input = useRef<HTMLInputElement>(null)
  const running = useRef<AbortController | null>(null)
  const [source, setSource] = useState<{ id: string; file: File } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [output, setOutput] = useState<{ key: string; blob: Blob } | null>(null)
  const outputKey = JSON.stringify([source?.id, scene.outputSpecs])
  const latest = useRef(outputKey)
  useLayoutEffect(() => {
    latest.current = outputKey
  }, [outputKey])
  useEffect(() => () => running.current?.abort(), [])
  const fileName = `${baseName(source?.file.name ?? 'document')}-watermarked.pdf`

  function open(file: File) {
    if (
      file.size > MAX_PDF_BYTES ||
      (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf'))
    ) {
      setError(t('documents.reader.invalidFile'))
      return
    }
    running.current?.abort()
    setSource({ id: crypto.randomUUID(), file })
    setOutput(null)
    setError(null)
    setNotice(null)
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    if (file !== undefined) open(file)
  }

  async function exportDocument(): Promise<Blob> {
    identity.assertCurrent()
    if (output?.key === outputKey) return output.blob
    if (source === null || scene.outputSpecs.length === 0)
      throw new Error(t('documents.reader.chooseMark'))
    const owner = captureOfflineOwner()
    running.current?.abort()
    const controller = new AbortController()
    running.current = controller
    setPending(true)
    setError(null)
    try {
      const blob = await processDocument(
        source.file,
        scene.outputSpecs,
        async (assetId) => {
          owner.assertCurrent()
          return await loadWorkspaceMedia(organizationId, assetFileUrl(organizationId, assetId))
        },
        controller.signal,
      )
      controller.signal.throwIfAborted()
      owner.assertCurrent()
      identity.assertCurrent()
      if (latest.current !== outputKey) throw new Error(t('documents.reader.changed'))
      setOutput({ key: outputKey, blob })
      return blob
    } finally {
      if (running.current === controller) {
        running.current = null
        setPending(false)
      }
    }
  }

  async function download() {
    try {
      downloadBlob(await exportDocument(), fileName)
    } catch (error) {
      setError(describeError(error))
    }
  }

  async function share() {
    try {
      await shareFile(await exportDocument(), fileName)
    } catch (error) {
      setError(describeError(error))
    }
  }

  return (
    <MediaEditorLayout scene={scene}>
      <Card
        className="flex min-w-0 flex-col gap-3 p-3 lg:p-4"
        onDragOver={(event) => event.preventDefault()}
        onDrop={drop}
      >
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={input}
            type="file"
            accept="application/pdf"
            aria-label={t('documents.reader.open')}
            className="sr-only"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              if (file !== undefined) open(file)
              event.currentTarget.value = ''
            }}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => input.current?.click()}
          >
            <FileText aria-hidden="true" className="size-4" />
            {t('documents.reader.open')}
          </Button>
          {config.data === undefined ? null : (
            <CloudImportButtons
              config={config.data}
              mediaKinds={['document']}
              onImport={(files) => {
                const file = files[0]
                if (file !== undefined) open(file)
              }}
              onError={setError}
            />
          )}
          <MediaHistory
            scene={scene}
            exportAction={
              <Button
                type="button"
                size="sm"
                disabled={source === null || scene.outputSpecs.length === 0 || pending}
                isPending={pending}
                onClick={() => {
                  void download()
                }}
                data-guidance-topic="export"
              >
                <Download aria-hidden="true" className="size-4" />
                {t('documents.reader.download')}
              </Button>
            }
          />
        </div>
        {source === null ? (
          <div className="flex min-h-[54svh] items-center justify-center rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink-muted">
            {t('documents.reader.empty')}
          </div>
        ) : (
          <DocumentViewer
            key={source.id}
            file={source.file}
            organizationId={organizationId}
            scene={scene}
          />
        )}
        {error === null ? null : <Alert tone="error">{error}</Alert>}
        {notice === null ? null : <Alert tone="success">{notice}</Alert>}
      </Card>
      <MediaTools organizationId={organizationId} canCreate={canCreatePresets} scene={scene}>
        <div className="tool-section flex flex-col gap-2">
          {canShareFiles('application/pdf') ? (
            <Button
              type="button"
              variant="secondary"
              disabled={source === null || scene.outputSpecs.length === 0 || pending}
              onClick={() => {
                void share()
              }}
            >
              <Share2 aria-hidden="true" className="size-4" />
              {t('editor.export.share')}
            </Button>
          ) : null}
          {config.data === undefined ? null : (
            <CloudSaveButtons
              config={config.data}
              disabled={source === null || scene.outputSpecs.length === 0 || pending}
              buttonClassName="w-full"
              buttonSize="md"
              getUploads={async () => [{ name: fileName, blob: await exportDocument() }]}
              onSaved={() => setNotice(t('documents.reader.cloudSaved'))}
              onError={setError}
            />
          )}
          {pending ? (
            <Button type="button" variant="ghost" onClick={() => running.current?.abort()}>
              <X aria-hidden="true" className="size-4" />
              {t('editor.cancel')}
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-ink-muted">{t('documents.reader.originalHint')}</p>
      </MediaTools>
    </MediaEditorLayout>
  )
}
