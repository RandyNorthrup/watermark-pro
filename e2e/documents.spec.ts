/** Real PDF export: every original page survives and receives a visible, nonempty mark. */
import {
  decodePDFRawStream,
  PDFArray,
  PDFContentStream,
  PDFDocument,
  PDFName,
  PDFNumber,
  type PDFPage,
  PDFRawStream,
  rgb,
} from 'pdf-lib'

import { PREVIEW_ORIGIN } from './preview'
import {
  downloadBytes,
  expect,
  expectAccessible,
  expectActiveWorkspace,
  navigateTo,
  signUpAndVerify,
  test,
} from './support'
import { MAX_PDF_PAGES, PDF_PRODUCER } from '../src/shared/constants'
import { DEFAULT_SHAPE_SPEC } from '../src/shared/watermark'

const PAGE_SIZES: [number, number][] = [
  [240, 320],
  [360, 240],
  [240, 320],
]
const PRESET_NAME = 'PDF centre stamp'
const DOCUMENT_TITLE = 'Synthetic three-page report'
const STAMP_RGB = [214, 32, 48]

async function pdfFixture(sizes: readonly [number, number][]) {
  const document = await PDFDocument.create()
  document.setTitle(DOCUMENT_TITLE)
  document.setAuthor('Synthetic document author')
  for (const [index, size] of sizes.entries()) {
    const page = document.addPage(size)
    // Existing vector content must survive alongside the added raster mark.
    page.drawRectangle({ x: 12 + index, y: 12, width: 30, height: 20, color: rgb(0, 0, 1) })
  }
  return Buffer.from(await document.save())
}

function pageContent(page: PDFPage): string {
  const contents = page.node.Contents()
  const streams = contents instanceof PDFArray ? contents.asArray() : [contents]
  return streams
    .map((entry) => {
      const stream = page.doc.context.lookup(entry)
      // pdf-lib normalization adds in-memory q/Q graphics-state streams around
      // loaded raw streams. Decode both real representations without omitting either.
      if (stream instanceof PDFRawStream)
        return Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1')
      if (stream instanceof PDFContentStream)
        return Buffer.from(stream.getUnencodedContents()).toString('latin1')
      throw new Error('The PDF page has no readable content stream.')
    })
    .join('\n')
}

function assertStampedPage(page: PDFPage) {
  const images = page.node.normalizedEntries().XObject
  expect(images.keys()).toHaveLength(1)
  for (const key of images.keys()) {
    const image = images.lookup(key)
    if (!(image instanceof PDFRawStream)) throw new Error('The PDF mark is not an image stream.')
    expect(image.dict.lookup(PDFName.of('Subtype'), PDFName).toString()).toBe('/Image')
    expect(pageContent(page)).toContain(`${key.toString()} Do`)
    const width = image.dict.lookup(PDFName.of('Width'), PDFNumber).asNumber()
    const height = image.dict.lookup(PDFName.of('Height'), PDFNumber).asNumber()
    const pixels = decodePDFRawStream(image).decode()
    const mask = image.dict.lookup(PDFName.of('SMask'))
    if (!(mask instanceof PDFRawStream)) throw new Error('The PDF mark has no transparency mask.')
    const alpha = decodePDFRawStream(mask).decode()
    const centre = Math.floor(height / 2) * width + Math.floor(width / 2)
    expect(pixels.length).toBe(width * height * 3)
    expect([...pixels.subarray(centre * 3, centre * 3 + 3)]).toEqual(STAMP_RGB)
    expect(alpha[centre]).toBe(255)
    // An empty image, or an edge-to-edge fill, cannot satisfy both controls.
    expect(alpha[0]).toBe(0)
  }
}

test('stamps every PDF page, preserves original content, and isolates refused files', async ({
  page,
  request,
}) => {
  test.slow()
  const person = {
    name: 'Document Owner',
    email: `documents-${crypto.randomUUID()}@example.test`,
    password: 'synthetic document passphrase',
  }
  await signUpAndVerify(page, request, person)
  const { organization } = await expectActiveWorkspace(page, person, 'My workspace')
  const preset = await page.request.post(`/api/orgs/${organization.id}/watermarks`, {
    headers: { origin: PREVIEW_ORIGIN },
    data: {
      name: PRESET_NAME,
      spec: {
        ...DEFAULT_SHAPE_SPEC,
        aspect: 1,
        fill: { enabled: true, colour: '#d62030', opacity: 1 },
        stroke: { width: 0, colour: null },
        placement: { mode: 'anchor', anchor: 'center' },
        style: { ...DEFAULT_SHAPE_SPEC.style, opacity: 1, scale: 0.5 },
      },
    },
  })
  expect(preset.status()).toBe(201)
  await navigateTo(page, 'Documents')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Documents')
  await expect(
    page.getByRole('button', { name: 'Watermark documents', exact: true }),
  ).toBeDisabled()
  const source = await pdfFixture(PAGE_SIZES)
  const oversized = await pdfFixture(Array.from({ length: MAX_PDF_PAGES + 1 }, () => [72, 72]))
  await page.getByLabel('Add PDFs').setInputFiles([
    { name: 'report.pdf', mimeType: 'application/pdf', buffer: source },
    { name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a PDF') },
    { name: 'too-many-pages.pdf', mimeType: 'application/pdf', buffer: oversized },
  ])
  const run = page.getByRole('button', { name: 'Watermark 3', exact: true })
  await expect(run).toBeDisabled()
  await page.getByRole('checkbox', { name: PRESET_NAME }).check()
  await expect(run).toBeEnabled()
  await expectAccessible(page)
  await run.click()
  await expect(page.getByText(/3 of 3 finished, 2 failed/)).toBeVisible()
  await expect(
    page.getByText(
      `This PDF has ${String(MAX_PDF_PAGES + 1)} pages; the limit is ${String(MAX_PDF_PAGES)}.`,
    ),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Download broken-watermarked.pdf' })).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Download too-many-pages-watermarked.pdf' }),
  ).toHaveCount(0)
  const downloadPending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download report-watermarked.pdf', exact: true }).click()
  const download = await downloadPending
  expect(download.suggestedFilename()).toBe('report-watermarked.pdf')
  const original = await PDFDocument.load(source, { updateMetadata: false })
  const output = await PDFDocument.load(await downloadBytes(download), { updateMetadata: false })
  expect(output.getPageCount()).toBe(PAGE_SIZES.length)
  expect(output.getTitle()).toBe(DOCUMENT_TITLE)
  expect(output.getAuthor()).toBe('Synthetic document author')
  expect(output.getProducer()).toBe(PDF_PRODUCER)
  for (const [index, stamped] of output.getPages().entries()) {
    const sourcePage = original.getPage(index)
    expect([stamped.getWidth(), stamped.getHeight()]).toEqual(PAGE_SIZES[index])
    expect(sourcePage.node.normalizedEntries().XObject.keys()).toHaveLength(0)
    expect(pageContent(stamped)).toContain(pageContent(sourcePage))
    assertStampedPage(stamped)
  }
  await expectAccessible(page)
})
