/**
 * Draws a rasterised watermark onto every page of a PDF with `pdf-lib`. Pure
 * byte work: it never touches a canvas itself, so it runs and earns coverage in
 * the jsdom/Node projects. The caller supplies `rasterise`, which turns one
 * distinct page size into transparent PNG bytes (that is where the canvas work,
 * in `raster.ts`, lives); each distinct size is rasterised and embedded once,
 * then stamped on every page of that size at the page's own dimensions, so
 * tiling and placement scale exactly as they do on photos.
 *
 * The document's Info dictionary is kept as-is apart from `Producer`, set to
 * `PDF_PRODUCER`, and `ModDate`, refreshed; encrypted documents are refused and
 * a document over the page cap is rejected before any drawing.
 */
import { pdfPageGeometry } from './page-geometry'
import { type PageSize, sizeKey } from './raster-layout'
import { ARTWORK_NOTICE_FILE } from '../../shared/asset-licenses'
import { MAX_PDF_PAGES, PDF_PRODUCER } from '../../shared/constants'

/** A document that cannot be watermarked without its password first being removed. */
export class EncryptedPdfError extends Error {
  override readonly name = 'EncryptedPdfError'
}

/** A document with more pages than the tool will process. */
export class PdfPageLimitError extends Error {
  override readonly name = 'PdfPageLimitError'
}

/** Renders the chosen marks for one page size to transparent PNG bytes. */
export type RasteriseForSize = (size: PageSize, pageNumber: number) => Promise<Uint8Array>

/**
 * Returns the watermarked PDF bytes. `rasterise` is called once per distinct
 * page size, in first-seen order.
 */
export async function watermarkPdf(
  input: Uint8Array,
  rasterise: RasteriseForSize,
  assetNotice: string | null = null,
  options: { perPage?: boolean; signal?: AbortSignal } = {},
): Promise<Uint8Array> {
  options.signal?.throwIfAborted()
  const { PDFDocument, degrees } = await import('pdf-lib')
  // Keep the existing Info dictionary: `updateMetadata` would overwrite
  // Producer and ModDate on load, and we set exactly those two ourselves.
  // `ignoreEncryption` lets an encrypted document load far enough to be
  // detected and refused here rather than throwing pdf-lib's own error.
  const document = await PDFDocument.load(input, {
    updateMetadata: false,
    ignoreEncryption: true,
  })
  if (document.isEncrypted) {
    throw new EncryptedPdfError(
      'This PDF is encrypted. Remove its password protection and try again.',
    )
  }

  const pages = document.getPages()
  if (pages.length > MAX_PDF_PAGES) {
    throw new PdfPageLimitError(
      `This PDF has ${String(pages.length)} pages; the limit is ${String(MAX_PDF_PAGES)}.`,
    )
  }

  const images = new Map<string, Awaited<ReturnType<typeof document.embedPng>>>()
  for (const [index, page] of pages.entries()) {
    options.signal?.throwIfAborted()
    const geometry = pdfPageGeometry(page)
    const size = { width: geometry.width, height: geometry.height }
    const key = options.perPage === true ? String(index) : sizeKey(size)
    let image = images.get(key)
    if (image === undefined) {
      image = await document.embedPng(await rasterise(size, index + 1))
      images.set(key, image)
    }
    options.signal?.throwIfAborted()
    page.drawImage(image, { ...geometry, rotate: degrees(geometry.rotation) })
  }

  document.setProducer(PDF_PRODUCER)
  if (assetNotice !== null) {
    await document.attach(
      Uint8Array.from(new TextEncoder().encode(assetNotice)),
      ARTWORK_NOTICE_FILE,
      {
        mimeType: 'text/plain',
        description: 'Licences for bundled artwork only; original document rights are unchanged.',
      },
    )
  }
  document.setModificationDate(new Date())
  options.signal?.throwIfAborted()
  const output = await document.save()
  options.signal?.throwIfAborted()
  return output
}
