import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  FolderArchive,
  Trash2,
  X,
} from 'lucide-react'
import { type DragEvent, useRef, useState } from 'react'

import { MAX_PDF_BYTES, MAX_PDF_FILES } from '../../../shared/constants'
import { zipEntries } from '../../bulk/zip'
import { apiRequest } from '../../lib/api'
import { downloadBlob } from '../../lib/download'
import { describeError } from '../../lib/errors'
import { formatBytes } from '../../lib/format-bytes'
import { assetFileUrl, watermarksQueryOptions } from '../../lib/library'
import { baseName } from '../../lib/spec-tokens'
import { DocumentRasteriser } from '../../pdf/raster'
import { hasSmartPlacement } from '../../pdf/raster-layout'
import { watermarkPdf } from '../../pdf/watermark-pdf'
import { PresetChecklist } from '../presets/preset-checklist'
import { PresetGate } from '../presets/preset-gate'
import { selectedSpecs } from '../presets/selected-specs'
import { Alert } from '../ui/alert'
import { Button } from '../ui/button'
import { Card } from '../ui/card'

interface DocumentsToolProps {
  organizationId: string
}

const ACCEPTED_PDF_TYPES = 'application/pdf'
const SMART_PLACEMENT_HINT =
  'Smart placement is for photos; choose a corner or a custom position for documents.'

/** One finished (or failed) document, kept in input order for the results list. */
interface Outcome {
  name: string
  output: { blob: Blob; fileName: string } | null
  error: string | null
}

/** The watermarked file keeps its base name and always becomes a `.pdf`. */
function outputName(fileName: string): string {
  return `${baseName(fileName)}-watermarked.pdf`
}

/** Row status glyph: a pending dot before the run, then a tick or a warning. */
function OutcomeIcon({ outcome }: { outcome: Outcome | undefined }) {
  if (outcome === undefined) {
    return (
      <span aria-hidden="true" className="inline-block size-4 rounded-full border border-line" />
    )
  }
  if (outcome.output === null) {
    return <AlertTriangle aria-hidden="true" className="size-4 text-rose-600" />
  }
  return <CheckCircle2 aria-hidden="true" className="size-4 text-emerald-600" />
}

function isPdf(file: File): boolean {
  return file.type === ACCEPTED_PDF_TYPES || file.name.toLowerCase().endsWith('.pdf')
}

function keyOf(file: File): string {
  return `${file.name}:${String(file.size)}`
}

/** Merges new files in, dropping duplicates and anything past the file cap. */
function dedupe(existing: readonly File[], incoming: readonly File[]): File[] {
  const seen = new Set(existing.map((file) => keyOf(file)))
  const merged = [...existing]
  for (const file of incoming) {
    if (seen.has(keyOf(file))) {
      continue
    }
    seen.add(keyOf(file))
    merged.push(file)
  }
  return merged.slice(0, MAX_PDF_FILES)
}

/**
 * Documents tool: pick PDFs and a preset, watermark every page of each in the
 * browser, and download them one by one or as a ZIP. The layers are rasterised
 * once per distinct page size and drawn onto every page; nothing is uploaded.
 */
export function DocumentsTool({ organizationId }: DocumentsToolProps) {
  const presets = useQuery(watermarksQueryOptions(organizationId))
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [presetIds, setPresetIds] = useState<string[]>([])
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [skippedNote, setSkippedNote] = useState<string | null>(null)
  const [batchError, setBatchError] = useState<string | null>(null)
  const [isZipping, setIsZipping] = useState(false)
  const [zipError, setZipError] = useState<string | null>(null)

  const specs = selectedSpecs(presetIds, presets.data)
  const hasPresets = specs.length > 0
  const hasSmartPreset = specs.some((spec) => hasSmartPlacement(spec))
  const isRunning = progress !== null && progress.done < progress.total
  const done =
    outcomes?.flatMap((outcome) => (outcome.output === null ? [] : [outcome.output])) ?? []

  function addFiles(list: FileList | File[]) {
    const incoming = [...list]
    const pdfs = incoming.filter((file) => isPdf(file))
    const withinSize = pdfs.filter((file) => file.size <= MAX_PDF_BYTES)
    const skipped = incoming.length - withinSize.length
    setFiles((previous) => dedupe(previous, withinSize))
    setSkippedNote(
      skipped === 0
        ? null
        : `${String(skipped)} file${skipped === 1 ? '' : 's'} skipped: not a PDF or over ${formatBytes(MAX_PDF_BYTES)}.`,
    )
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    addFiles(event.dataTransfer.files)
  }

  function togglePreset(id: string, isChecked: boolean) {
    setPresetIds((previous) =>
      isChecked
        ? [...previous.filter((other) => other !== id), id]
        : previous.filter((other) => other !== id),
    )
  }

  async function loadLogo(assetId: string): Promise<Blob> {
    const response = await apiRequest(assetFileUrl(organizationId, assetId))
    return await response.blob()
  }

  async function processOne(rasteriser: DocumentRasteriser, file: File): Promise<Outcome> {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const output = await watermarkPdf(bytes, (size) => rasteriser.rasterise(size))
      return {
        name: file.name,
        output: {
          // A `Uint8Array<ArrayBufferLike>` is a valid BlobPart at runtime; the
          // cast bridges TS 6's narrower lib.dom BlobPart (as in metadata/write.ts).
          blob: new Blob([output] as BlobPart[], { type: 'application/pdf' }),
          fileName: outputName(file.name),
        },
        error: null,
      }
    } catch (error) {
      return { name: file.name, output: null, error: describeError(error) }
    }
  }

  async function run() {
    if (!hasPresets || files.length === 0) {
      return
    }
    setBatchError(null)
    setZipError(null)
    setOutcomes([])
    setProgress({ done: 0, total: files.length })
    const rasteriser = new DocumentRasteriser(loadLogo)
    const collected: Outcome[] = []
    try {
      await rasteriser.prepare(specs)
      for (const file of files) {
        collected.push(await processOne(rasteriser, file))
        setOutcomes([...collected])
        setProgress({ done: collected.length, total: files.length })
      }
    } catch (error) {
      // A shared step failed (a logo could not be loaded); the whole run stops.
      setBatchError(describeError(error))
      setProgress({ done: files.length, total: files.length })
    } finally {
      rasteriser.close()
    }
  }

  async function downloadZip() {
    setIsZipping(true)
    setZipError(null)
    try {
      const blob = await zipEntries(
        done.map((output) => ({ name: output.fileName, blob: output.blob })),
      )
      downloadBlob(blob, `watermarked-${String(done.length)}-documents.zip`)
    } catch (error) {
      setZipError(describeError(error))
    } finally {
      setIsZipping(false)
    }
  }

  const failedCount = outcomes?.filter((outcome) => outcome.output === null).length ?? 0

  return (
    <PresetGate query={presets} emptyHint="to watermark documents with it.">
      {(list) => (
        <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          <Card className="flex flex-col gap-4 p-4">
            <div
              onDragOver={(event) => {
                event.preventDefault()
              }}
              onDrop={onDrop}
              className="flex flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed border-line px-4 py-8 text-center"
            >
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED_PDF_TYPES}
                multiple
                aria-label="Add PDFs"
                className="sr-only"
                onChange={(event) => {
                  if (event.currentTarget.files !== null) {
                    addFiles(event.currentTarget.files)
                  }
                  event.currentTarget.value = ''
                }}
              />
              <FileText aria-hidden="true" className="size-8 text-ink-muted" />
              <p className="flex flex-wrap items-center justify-center gap-2 text-sm text-ink-muted">
                Drop PDFs here, or
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={isRunning}
                  onClick={() => {
                    inputRef.current?.click()
                  }}
                >
                  Add PDFs
                </Button>
              </p>
              <p className="text-xs text-ink-muted">
                Up to {String(MAX_PDF_FILES)} files, {formatBytes(MAX_PDF_BYTES)} each. Every page
                is watermarked in your browser; nothing is uploaded.
              </p>
            </div>

            {skippedNote === null ? null : (
              <p className="text-xs text-amber-600" role="status">
                {skippedNote}
              </p>
            )}

            {files.length === 0 ? null : (
              <section aria-labelledby="documents-files-heading" className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h2 id="documents-files-heading" className="text-sm font-semibold">
                    {String(files.length)} document{files.length === 1 ? '' : 's'}
                  </h2>
                  {isRunning ? null : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setFiles([])
                        setOutcomes(null)
                        setProgress(null)
                      }}
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                      Clear list
                    </Button>
                  )}
                </div>
                {progress === null ? null : (
                  <>
                    <progress
                      aria-label="Watermarking progress"
                      max={progress.total}
                      value={progress.done}
                      className="h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-line [&::-webkit-progress-value]:bg-brand-600"
                    />
                    <p className="text-xs text-ink-muted" aria-live="polite">
                      {String(progress.done)} of {String(progress.total)} finished
                      {failedCount > 0 ? `, ${String(failedCount)} failed` : ''}.
                    </p>
                  </>
                )}
                <ul
                  aria-label="Documents to watermark"
                  className="divide-y divide-line rounded-lg border border-line"
                >
                  {files.map((file) => {
                    const outcome = outcomes?.find((candidate) => candidate.name === file.name)
                    const output = outcome?.output ?? null
                    return (
                      <li key={keyOf(file)} className="flex items-center gap-2 px-3 py-2 text-sm">
                        <OutcomeIcon outcome={outcome} />
                        <span className="min-w-0 flex-1 truncate" title={file.name}>
                          {file.name}
                        </span>
                        <span className="text-xs text-ink-muted">{formatBytes(file.size)}</span>
                        {outcome?.error === undefined || outcome.error === null ? null : (
                          <span className="text-xs text-rose-600" role="alert">
                            {outcome.error}
                          </span>
                        )}
                        {output === null ? null : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Download ${output.fileName}`}
                            onClick={() => {
                              downloadBlob(output.blob, output.fileName)
                            }}
                          >
                            <Download aria-hidden="true" className="size-4" />
                          </Button>
                        )}
                        {outcome === undefined && !isRunning ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${file.name}`}
                            onClick={() => {
                              setFiles((previous) =>
                                previous.filter((candidate) => candidate !== file),
                              )
                            }}
                          >
                            <X aria-hidden="true" className="size-4" />
                          </Button>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}

            {batchError === null ? null : <Alert tone="error">{batchError}</Alert>}
          </Card>

          <Card className="flex flex-col gap-5">
            <PresetChecklist
              presets={list}
              selectedIds={presetIds}
              disabled={isRunning}
              onToggle={togglePreset}
              hint="Tick one or more; they are drawn in the order ticked, later ones over earlier ones."
            />

            {hasSmartPreset ? (
              <Alert tone="info" title="Placement">
                {SMART_PLACEMENT_HINT}
              </Alert>
            ) : null}

            <Button
              type="button"
              disabled={files.length === 0 || !hasPresets || isRunning}
              isPending={isRunning}
              onClick={() => {
                void run()
              }}
            >
              Watermark {files.length === 0 ? 'documents' : String(files.length)}
            </Button>

            {!isRunning && done.length > 0 ? (
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  isPending={isZipping}
                  onClick={() => {
                    void downloadZip()
                  }}
                >
                  {isZipping ? null : <FolderArchive aria-hidden="true" className="size-4" />}
                  Download {String(done.length)} as ZIP
                </Button>
                {zipError === null ? null : <Alert tone="error">{zipError}</Alert>}
              </div>
            ) : null}

            <p className="text-xs text-ink-muted">
              Each document is saved as {'{name}'}-watermarked.pdf. Encrypted PDFs are refused.
            </p>
          </Card>
        </div>
      )}
    </PresetGate>
  )
}
