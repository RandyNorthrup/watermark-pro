import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { PDFDocument } from 'pdf-lib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_TEXT_SPEC } from '../../../shared/watermark'
import { canShareFiles, shareFile } from '../../lib/share-file'
import { processDocument } from '../../pdf/process-document'
import type { PdfPagePreview } from '../../pdf/reader'
import { seedOwnerWorkspace } from '../../test-support/fake-auth-client'
import { fakeAuth, installFakeAuth } from '../../test-support/fake-auth-module'
import { downloads } from '../../test-support/fake-download'
import { installLibraryApi, makeWatermark } from '../../test-support/fake-library-api'
import { resetFakePreview } from '../../test-support/fake-preview'
import { interruptMediaExport } from '../../test-support/interrupt-media-export'
import { selectSavedWatermarks } from '../../test-support/media-controls'
import { mockElementBounds } from '../../test-support/mock-element-bounds'
import { markPng } from '../../test-support/pdf-fixtures'
import { renderApp } from '../../test-support/render-app'

interface ReaderFixture {
  pageCount: number
  render: (page: number, signal: AbortSignal) => Promise<PdfPagePreview>
  close: () => Promise<void>
}
const reader = vi.hoisted(() => ({
  open: vi.fn<(file: File) => Promise<ReaderFixture>>(),
  close: vi.fn<() => Promise<void>>(),
}))
vi.mock('../../lib/auth-client', () => import('../../test-support/fake-auth-module'))
vi.mock('../../lib/preview', () => import('../../test-support/fake-preview'))
vi.mock('../../lib/download', () => import('../../test-support/fake-download'))
vi.mock('../../lib/share-file', () => ({ canShareFiles: vi.fn(), shareFile: vi.fn() }))
vi.mock('../../pdf/reader', () => ({ PdfReader: { open: reader.open } }))
vi.mock('../../pdf/process-document', () => ({ processDocument: vi.fn() }))

async function pdfFile(name = 'report.pdf') {
  const pdf = await PDFDocument.create()
  pdf.addPage([300, 400])
  pdf.addPage([500, 300])
  return new File([Uint8Array.from(await pdf.save())], name, { type: 'application/pdf' })
}
async function readFixture(file: File): Promise<ReaderFixture> {
  const pdf = await PDFDocument.load(await file.arrayBuffer())
  return {
    pageCount: pdf.getPageCount(),
    close: reader.close,
    render: (page, signal) => {
      signal.throwIfAborted()
      const source = pdf.getPage(page - 1)
      const size = { width: source.getWidth(), height: source.getHeight() }
      const bytes = Uint8Array.from(markPng())
      return Promise.resolve({
        file: new File([bytes], 'page.png', { type: 'image/png' }),
        size,
        pixels: size,
        text: `Original Page ${String(page)}`,
      })
    },
  }
}
async function openDocuments() {
  const user = userEvent.setup()
  seedOwnerWorkspace(fakeAuth())
  installLibraryApi({
    watermarks: [
      makeWatermark(),
      makeWatermark({
        id: 'wm-2',
        name: 'Second Mark',
        spec: { ...DEFAULT_TEXT_SPEC, text: 'Second' },
      }),
    ],
  })
  const view = renderApp('/app/documents')
  const input = await screen.findByLabelText('Open PDF')
  return { ...view, input, user }
}
async function loadDocument(user: ReturnType<typeof userEvent.setup>) {
  const source = await pdfFile()
  await user.upload(screen.getByLabelText('Open PDF'), source)
  await screen.findByRole('img', { name: 'PDF Page 1' })
  return source
}
beforeEach(() => {
  installFakeAuth()
  resetFakePreview()
  downloads.mockClear()
  reader.open.mockReset().mockImplementation(readFixture)
  reader.close.mockReset().mockResolvedValue()
  vi.mocked(processDocument)
    .mockReset()
    .mockResolvedValue(new Blob(['complete PDF'], { type: 'application/pdf' }))
  vi.mocked(canShareFiles).mockReset().mockReturnValue(false)
  vi.mocked(shareFile).mockReset().mockResolvedValue('shared')
  mockElementBounds()
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:pdf-test'), revokeObjectURL: vi.fn() })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('inline Documents page', () => {
  it('defers decoding until a file is selected and provides templates without requiring saved presets', async () => {
    const { user } = await openDocuments()
    expect(reader.open).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: 'Text' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Export PDF' })).toBeDisabled()
    await user.click(screen.getByRole('tab', { name: 'Presets' }))
    expect(screen.getByRole('region', { name: 'Presets' })).toBeVisible()
  })
  it('navigates pages, edits inline and exports the current source and marks', async () => {
    const { user, unmount } = await openDocuments()
    const source = await loadDocument(user)
    await user.click(screen.getByRole('button', { name: 'Next Page' }))
    expect(await screen.findByRole('img', { name: 'PDF Page 2' })).toBeVisible()
    expect(screen.getByRole('spinbutton', { name: 'Page' })).toHaveValue(2)
    expect(screen.getByRole('button', { name: 'Next Page' })).toBeDisabled()
    await user.click(screen.getByText('Page Text', { exact: true }))
    expect(screen.getByText('Original Page 2', { exact: true })).toBeVisible()
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Page' }), { target: { value: '9' } })
    expect(screen.getByRole('spinbutton', { name: 'Page' })).toHaveValue(2)
    await user.click(screen.getByRole('button', { name: 'Previous Page' }))
    expect(await screen.findByRole('img', { name: 'PDF Page 1' })).toBeVisible()
    fireEvent.change(screen.getByRole('textbox', { name: 'Text' }), {
      target: { value: 'Document QA' },
    })
    await user.click(screen.getByRole('button', { name: 'Export PDF' }))
    await waitFor(() => expect(downloads).toHaveBeenCalledOnce())
    expect(processDocument).toHaveBeenCalledWith(
      source,
      [expect.objectContaining({ kind: 'text', text: 'Document QA' })],
      expect.any(Function),
      expect.any(AbortSignal),
    )
    expect(downloads).toHaveBeenCalledWith(expect.any(Blob), 'report-watermarked.pdf')
    unmount()
    expect(reader.close).toHaveBeenCalledOnce()
  })
  it('hides zoom until page dimensions exist and reports decoder errors without a fake page', async () => {
    const pending = Promise.withResolvers<ReaderFixture>()
    reader.open.mockReturnValueOnce(pending.promise)
    const { user } = await openDocuments()
    await user.upload(screen.getByLabelText('Open PDF'), await pdfFile())
    expect(screen.queryByRole('group', { name: 'Canvas view' })).not.toBeInTheDocument()
    await act(async () => {
      pending.reject(new Error('PDF could not be decoded'))
      await expect(pending.promise).rejects.toThrow('PDF could not be decoded')
    })
    expect(await screen.findByText('PDF could not be decoded')).toBeVisible()
    expect(screen.queryByRole('img', { name: /^PDF Page/ })).not.toBeInTheDocument()
  })
  it('reuses an unchanged export and invalidates it after an edit', async () => {
    const { user } = await openDocuments()
    await loadDocument(user)
    const button = screen.getByRole('button', { name: 'Export PDF' })
    await user.click(button)
    await waitFor(() => expect(downloads).toHaveBeenCalledOnce())
    await user.click(button)
    await waitFor(() => expect(downloads).toHaveBeenCalledTimes(2))
    expect(processDocument).toHaveBeenCalledOnce()
    fireEvent.change(screen.getByRole('textbox', { name: 'Text' }), {
      target: { value: 'Changed' },
    })
    await user.click(button)
    await waitFor(() => expect(processDocument).toHaveBeenCalledTimes(2))
  })
  it('preserves selected layer order and makes clear undoable', async () => {
    const { user } = await openDocuments()
    await loadDocument(user)
    await selectSavedWatermarks(user, ['wm-2', 'wm-1'])
    await user.click(screen.getByRole('button', { name: 'Clear canvas' }))
    expect(screen.getByRole('button', { name: 'Export PDF' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await user.click(screen.getByRole('button', { name: 'Export PDF' }))
    await waitFor(() => expect(processDocument).toHaveBeenCalledOnce())
    expect(processDocument).toHaveBeenCalledWith(
      expect.any(File),
      [
        expect.objectContaining({ text: 'Second' }),
        expect.objectContaining({ text: '© Acme Studio' }),
      ],
      expect.any(Function),
      expect.any(AbortSignal),
    )
  })
  it.each(['edit', 'cancel', 'account', 'unmount'] as const)(
    'rejects late completion after %s',
    async (action) => {
      const pending = Promise.withResolvers<Blob>()
      vi.mocked(processDocument).mockReturnValueOnce(pending.promise)
      const { user, unmount } = await openDocuments()
      await loadDocument(user)
      await user.click(screen.getByRole('button', { name: 'Export PDF' }))
      await waitFor(() => expect(processDocument).toHaveBeenCalledOnce())
      const signal = vi.mocked(processDocument).mock.calls[0]?.[3]
      await interruptMediaExport(action, user, unmount)
      await act(async () => {
        pending.resolve(new Blob(['stale export']))
        await pending.promise
      })
      expect(downloads).not.toHaveBeenCalled()
      if (action === 'cancel' || action === 'unmount') expect(signal?.aborted).toBe(true)
      else if (action === 'edit')
        expect(await screen.findByText(/changed during export/)).toBeVisible()
    },
  )
  it('rejects unsupported drops without replacing the document and permits an export retry', async () => {
    const { user, input } = await openDocuments()
    await loadDocument(user)
    const parent = input.parentElement
    if (parent === null) throw new Error('Document drop target missing')
    fireEvent.drop(parent, {
      dataTransfer: { files: [new File(['text'], 'notes.txt', { type: 'text/plain' })] },
    })
    expect(await screen.findByText('Choose a PDF within the document size limit.')).toBeVisible()
    expect(screen.getByRole('img', { name: 'PDF Page 1' })).toBeVisible()
    vi.mocked(processDocument).mockRejectedValueOnce(new Error('Decoder failed'))
    await user.click(screen.getByRole('button', { name: 'Export PDF' }))
    expect(await screen.findByText('Decoder failed')).toBeVisible()
    expect(downloads).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Export PDF' }))
    await waitFor(() => expect(downloads).toHaveBeenCalledOnce())
  })
  it('shares the output and preserves it after a refused share', async () => {
    vi.mocked(canShareFiles).mockReturnValue(true)
    const { user } = await openDocuments()
    await loadDocument(user)
    await user.click(screen.getByRole('button', { name: 'Share' }))
    await waitFor(() =>
      expect(shareFile).toHaveBeenCalledWith(expect.any(Blob), 'report-watermarked.pdf'),
    )
    vi.mocked(shareFile).mockRejectedValueOnce(new Error('Share refused'))
    await user.click(screen.getByRole('button', { name: 'Share' }))
    expect(await screen.findByText('Share refused')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Export PDF' }))
    await waitFor(() => expect(downloads).toHaveBeenCalledOnce())
    expect(processDocument).toHaveBeenCalledOnce()
  })
})
