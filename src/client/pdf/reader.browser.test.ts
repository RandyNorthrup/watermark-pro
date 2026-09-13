import { degrees, PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { describe, expect, it } from 'vitest'

import { processDocument } from './process-document'
import { PdfReader } from './reader'
import { DEFAULT_SHAPE_SPEC } from '../../shared/watermark'

async function fixture(): Promise<File> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (const rotation of [0, 90, 180, 270]) {
    const page = pdf.addPage([320, 240])
    page.setCropBox(40, 30, 240, 160)
    page.setRotation(degrees(rotation))
    page.drawRectangle({ x: 0, y: 0, width: 320, height: 240, color: rgb(1, 1, 1) })
    page.drawText(`Original Vector Text ${String(rotation)}`, {
      x: 65,
      y: 115,
      size: 10,
      font,
      color: rgb(0, 0, 0),
    })
    page.drawRectangle({ x: 45, y: 35, width: 20, height: 20, color: rgb(0, 0, 1) })
  }
  return new File([Uint8Array.from(await pdf.save())], 'reader-proof.pdf', {
    type: 'application/pdf',
  })
}

async function pixels(file: File): Promise<ImageData> {
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (context === null) throw new Error('Missing canvas')
    context.drawImage(bitmap, 0, 0)
    return context.getImageData(0, 0, canvas.width, canvas.height)
  } finally {
    bitmap.close()
  }
}

describe('real PDF reader and export', () => {
  it('keeps original searchable content and puts the mark in the displayed bottom-right on every page rotation', async () => {
    const source = await fixture()
    const signal = new AbortController().signal
    const output = await processDocument(
      source,
      [
        {
          ...DEFAULT_SHAPE_SPEC,
          shape: 'rectangle',
          aspect: 1,
          fill: { enabled: true, colour: '#ff0000', opacity: 1 },
          stroke: { width: 0, colour: null },
          placement: { mode: 'anchor', anchor: 'bottom-right' },
          style: { ...DEFAULT_SHAPE_SPEC.style, opacity: 1, scale: 0.2 },
        },
      ],
      () => Promise.reject(new Error('No logo should be requested')),
      signal,
    )
    const original = await PdfReader.open(source)
    const reader = await PdfReader.open(new File([output], 'output.pdf', { type: output.type }))
    try {
      expect(reader.pageCount).toBe(4)
      for (let page = 1; page <= reader.pageCount; page += 1) {
        const before = await original.render(page, signal, 320)
        const after = await reader.render(page, signal, 320)
        expect(after.size).toEqual(
          page % 2 === 1 ? { width: 240, height: 160 } : { width: 160, height: 240 },
        )
        expect(after.text).toContain('Original Vector Text')
        expect(after.text).toBe(before.text)
        const image = await pixels(after.file)
        const prior = await pixels(before.file)
        let marked = 0
        let markedOutsideCorner = 0
        let changedElsewhere = 0
        for (let pixel = 0; pixel < image.width * image.height; pixel += 1) {
          const index = pixel * 4
          const x = pixel % image.width
          const y = Math.floor(pixel / image.width)
          const isCorner = x > image.width * 0.65 && y > image.height * 0.6
          const isRed = (image.data[index] ?? 0) > 200 && (image.data[index + 1] ?? 255) < 50
          if (isRed) {
            marked += 1
            if (!isCorner) markedOutsideCorner += 1
          }
          if (!isCorner && image.data[index] !== prior.data[index]) changedElsewhere += 1
        }
        expect(marked).toBeGreaterThan(500)
        expect(markedOutsideCorner).toBe(0)
        expect(changedElsewhere).toBe(0)
      }
    } finally {
      await original.close()
      await reader.close()
    }
  })

  it('rejects invalid data and stops canceled page work', async () => {
    await expect(PdfReader.open(new File(['not a PDF'], 'bad.pdf'))).rejects.toThrow()
    const reader = await PdfReader.open(await fixture())
    try {
      const controller = new AbortController()
      controller.abort()
      await expect(reader.render(1, controller.signal)).rejects.toThrow()
      await expect(reader.render(100, new AbortController().signal)).rejects.toThrow()
    } finally {
      await reader.close()
    }
  })
})
