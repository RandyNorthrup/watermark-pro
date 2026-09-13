/** Local PDF reader: renders original pages without executing document actions or uploading bytes. */
import type { PDFDocumentProxy, PDFDocumentLoadingTask } from 'pdfjs-dist'

import { MAX_PDF_BYTES, MAX_PDF_PAGES } from '../../shared/constants'
import type { Size } from '../engine/layout'

/** Display-only limit; exported PDFs retain their original vector pages and embedded source images. */
export const PDF_PREVIEW_MAX_SIDE = 2000

export interface PdfPagePreview {
  file: File
  /** Displayed CropBox size in points, after the page's own rotation. */
  size: Size
  pixels: Size
  text: string
}

function encode(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) reject(new Error('The document preview could not be encoded.'))
      else resolve(blob)
    }, 'image/png')
  })
}

/** Owns one parsing worker/document and cancels its work when the source or workspace changes. */
export class PdfReader {
  static async open(file: File): Promise<PdfReader> {
    if (file.size > MAX_PDF_BYTES) throw new RangeError('The PDF exceeds the document size limit.')
    const { getDocument, GlobalWorkerOptions, version } = await import('pdfjs-dist')
    const assetBase = `/assets/pdfjs/${version}/`
    GlobalWorkerOptions.workerSrc = `${assetBase}pdf.worker.min.mjs`
    const loading = getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      cMapUrl: `${assetBase}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${assetBase}standard_fonts/`,
      wasmUrl: `${assetBase}wasm/`,
      iccUrl: `${assetBase}iccs/`,
      useWorkerFetch: true,
      useSystemFonts: false,
      enableXfa: false,
      stopAtErrors: true,
      verbosity: 0,
    })
    try {
      const document = await loading.promise
      if (document.numPages > MAX_PDF_PAGES)
        throw new RangeError('The PDF exceeds the document page limit.')
      return new PdfReader(loading, document)
    } catch (error) {
      await loading.destroy()
      throw error
    }
  }

  readonly #loading: PDFDocumentLoadingTask
  readonly #document: PDFDocumentProxy

  private constructor(loading: PDFDocumentLoadingTask, document: PDFDocumentProxy) {
    this.#loading = loading
    this.#document = document
  }

  get pageCount(): number {
    return this.#document.numPages
  }

  /** Paint a real page, with its rotation/crop and selectable text available to the viewer. */
  async render(
    pageNumber: number,
    signal: AbortSignal,
    maxSide = PDF_PREVIEW_MAX_SIDE,
  ): Promise<PdfPagePreview> {
    signal.throwIfAborted()
    const page = await this.#document.getPage(pageNumber)
    signal.throwIfAborted()
    const natural = page.getViewport({ scale: 1 })
    if (
      !Number.isFinite(natural.width + natural.height) ||
      natural.width <= 0 ||
      natural.height <= 0
    )
      throw new RangeError('Invalid PDF page geometry.')
    const viewport = page.getViewport({ scale: maxSide / Math.max(natural.width, natural.height) })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.ceil(viewport.width))
    canvas.height = Math.max(1, Math.ceil(viewport.height))
    const task = page.render({ canvas, viewport })
    const cancel = () => task.cancel()
    signal.addEventListener('abort', cancel, { once: true })
    try {
      await task.promise
      signal.throwIfAborted()
      const content = await page.getTextContent()
      const blob = await encode(canvas)
      signal.throwIfAborted()
      return {
        file: new File([blob], `page-${String(pageNumber)}.png`, { type: 'image/png' }),
        size: { width: natural.width, height: natural.height },
        pixels: { width: canvas.width, height: canvas.height },
        text: content.items.flatMap((item) => ('str' in item ? [item.str] : [])).join(' '),
      }
    } finally {
      signal.removeEventListener('abort', cancel)
      canvas.width = 1
      canvas.height = 1
      page.cleanup()
    }
  }

  async close(): Promise<void> {
    await this.#loading.destroy()
  }
}
