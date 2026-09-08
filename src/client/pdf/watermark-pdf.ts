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
import { PDFDocument } from 'pdf-lib'

import { distinctPageSizes, type PageSize, sizeKey } from './raster-layout'
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
export type RasteriseForSize = (size: PageSize) => Promise<Uint8Array>

/**
 * Returns the watermarked PDF bytes. `rasterise` is called once per distinct
 * page size, in first-seen order.
 */
export async function watermarkPdf(
  input: Uint8Array,
  rasterise: RasteriseForSize,
): Promise<Uint8Array> {
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

  const sizes = pages.map((page) => ({ width: page.getWidth(), height: page.getHeight() }))
  for (const distinct of distinctPageSizes(sizes)) {
    const image = await document.embedPng(await rasterise(distinct.size))
    for (const page of pages) {
      const size = { width: page.getWidth(), height: page.getHeight() }
      if (sizeKey(size) === distinct.key) {
        page.drawImage(image, { x: 0, y: 0, width: size.width, height: size.height })
      }
    }
  }

  document.setProducer(PDF_PRODUCER)
  document.setModificationDate(new Date())
  return await document.save()
}
