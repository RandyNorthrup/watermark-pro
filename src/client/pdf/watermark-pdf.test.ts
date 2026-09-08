import { PDFDocument } from 'pdf-lib'
import { describe, expect, it, vi } from 'vitest'

import type { PageSize } from './raster-layout'
import { EncryptedPdfError, PdfPageLimitError, watermarkPdf } from './watermark-pdf'
import { MAX_PDF_PAGES, PDF_PRODUCER } from '../../shared/constants'
import { markPng } from '../test-support/pdf-fixtures'

/** A rasteriser that always returns the stand-in PNG and records the sizes asked for. */
function fakeRasteriser() {
  return vi.fn((_size: PageSize) => Promise.resolve(markPng()))
}

/** Builds a PDF of the given page sizes, in points. */
async function buildPdf(pageSizes: readonly PageSize[], title?: string): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  if (title !== undefined) {
    document.setTitle(title)
  }
  for (const size of pageSizes) {
    document.addPage([size.width, size.height])
  }
  return await document.save()
}

describe('watermarkPdf', () => {
  it('draws the mark on every page and keeps the rest of the Info dictionary', async () => {
    const rasterise = fakeRasteriser()
    const input = await buildPdf(
      [
        { width: 300, height: 400 },
        { width: 300, height: 400 },
      ],
      'Report',
    )

    const output = await watermarkPdf(input, rasterise)

    // Two pages of one size: the mark is rasterised once and embedded once.
    expect(rasterise).toHaveBeenCalledTimes(1)
    expect(rasterise.mock.calls[0]?.[0]).toEqual({ width: 300, height: 400 })

    // Reload without letting pdf-lib rewrite the metadata it would otherwise
    // stamp, so the Producer under test is the one `watermarkPdf` wrote.
    const reloaded = await PDFDocument.load(output, { updateMetadata: false })
    const pages = reloaded.getPages()
    expect(pages).toHaveLength(2)
    for (const page of pages) {
      const xObject = page.node.normalizedEntries().XObject
      expect(xObject.keys().length).toBeGreaterThan(0)
    }
    expect(reloaded.getProducer()).toBe(PDF_PRODUCER)
    expect(reloaded.getModificationDate()).toBeInstanceOf(Date)
    // The original title survives; only Producer and ModDate change.
    expect(reloaded.getTitle()).toBe('Report')
  })

  it('rasterises once per distinct page size', async () => {
    const rasterise = fakeRasteriser()
    const input = await buildPdf([
      { width: 300, height: 400 },
      { width: 500, height: 600 },
      { width: 300, height: 400 },
    ])

    await watermarkPdf(input, rasterise)

    expect(rasterise).toHaveBeenCalledTimes(2)
    expect(rasterise.mock.calls.map((call) => call[0])).toEqual([
      { width: 300, height: 400 },
      { width: 500, height: 600 },
    ])
  })

  it('refuses an encrypted PDF', async () => {
    const document = await PDFDocument.create()
    document.addPage([200, 200])
    // Give the trailer an Encrypt entry so a reload is detected as encrypted;
    // pdf-lib cannot write real encryption, and this exercises the same guard.
    const encryptRef = document.context.register(document.context.obj({}))
    document.context.trailerInfo.Encrypt = encryptRef
    const input = await document.save()

    const rasterise = fakeRasteriser()
    await expect(watermarkPdf(input, rasterise)).rejects.toBeInstanceOf(EncryptedPdfError)
    expect(rasterise).not.toHaveBeenCalled()
  })

  it('rejects a PDF over the page cap before drawing', async () => {
    const rasterise = fakeRasteriser()
    const sizes = Array.from({ length: MAX_PDF_PAGES + 1 }, () => ({ width: 200, height: 200 }))
    const input = await buildPdf(sizes)

    await expect(watermarkPdf(input, rasterise)).rejects.toBeInstanceOf(PdfPageLimitError)
    expect(rasterise).not.toHaveBeenCalled()
  })
})
