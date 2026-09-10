import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { PDFDocument } from 'pdf-lib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { seedOwnerWorkspace } from '../../test-support/fake-auth-client'
import { fakeAuth, installFakeAuth } from '../../test-support/fake-auth-module'
import { downloads } from '../../test-support/fake-download'
import { installLibraryApi, makeWatermark } from '../../test-support/fake-library-api'
import {
  DocumentRasteriser as FakeRasteriser,
  fakeRasterControls,
  rasterisedSizes,
  resetFakePdfRaster,
} from '../../test-support/fake-pdf-raster'
import { renderApp } from '../../test-support/render-app'

vi.mock('../../lib/auth-client', () => import('../../test-support/fake-auth-module'))
const rasterModuleLoaded = vi.hoisted(() => vi.fn())
vi.mock('../../pdf/raster', () => {
  rasterModuleLoaded()
  return import('../../test-support/fake-pdf-raster')
})
vi.mock('../../lib/download', () => import('../../test-support/fake-download'))

const client = fakeAuth

/** A real PDF with the given page sizes (points), as a picked file. */
async function pdfFile(name: string, pageSizes: readonly [number, number][]): Promise<File> {
  const document = await PDFDocument.create()
  for (const [width, height] of pageSizes) {
    document.addPage([width, height])
  }
  const bytes = await document.save()
  // The cast bridges TS 6's narrower lib.dom BlobPart; a Uint8Array is one at runtime.
  return new File([bytes] as BlobPart[], name, { type: 'application/pdf' })
}

type TestUser = ReturnType<typeof userEvent.setup>

/** Seeds the workspace, renders the documents page, and returns a fresh user. */
async function openDocuments(): Promise<TestUser> {
  const user = userEvent.setup()
  seedOwnerWorkspace(client())
  installLibraryApi({ watermarks: [makeWatermark()] })
  renderApp('/app/documents')
  await screen.findByLabelText('Add PDFs')
  return user
}

beforeEach(() => {
  installFakeAuth()
  resetFakePdfRaster()
  downloads.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('documents page', () => {
  it('watermarks a PDF, shows the smart-placement hint, and downloads it', async () => {
    const user = await openDocuments()
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Documents')
    expect(rasterModuleLoaded).not.toHaveBeenCalled()

    await user.upload(
      screen.getByLabelText('Add PDFs'),
      await pdfFile('report.pdf', [
        [300, 400],
        [300, 400],
      ]),
    )
    expect(screen.getByRole('heading', { level: 2, name: '1 document' })).toBeInTheDocument()

    // makeWatermark uses smart placement, so ticking it shows the hint.
    await user.click(screen.getByRole('checkbox', { name: 'Studio signature' }))
    expect(screen.getByText(/Smart placement is for photos/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Watermark/ }))
    await waitFor(() => expect(screen.getByText(/1 of 1 finished/)).toBeInTheDocument())
    expect(rasterModuleLoaded).toHaveBeenCalledOnce()
    expect(FakeRasteriser.closed).toBe(1)

    // Two pages of one size: the fake was asked to rasterise that size once.
    expect(rasterisedSizes).toEqual([{ width: 300, height: 400 }])

    await user.click(screen.getByRole('button', { name: 'Download report-watermarked.pdf' }))
    expect(downloads).toHaveBeenLastCalledWith(expect.any(Blob), 'report-watermarked.pdf')
  })

  it('downloads several results as a ZIP and skips non-PDF files', async () => {
    const user = await openDocuments()

    // Drop, rather than pick, so the non-PDF is not filtered out by the
    // input's `accept` before the tool sees and reports it.
    const dropZone = screen.getByLabelText('Add PDFs').parentElement
    if (dropZone === null) {
      throw new Error('drop zone not found')
    }
    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [
          await pdfFile('a.pdf', [[300, 400]]),
          await pdfFile('b.pdf', [[500, 600]]),
          new File([new Uint8Array(4)], 'notes.txt', { type: 'text/plain' }),
        ],
      },
    })
    expect(
      await screen.findByRole('heading', { level: 2, name: '2 documents' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/1 file skipped/)).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Studio signature' }))
    await user.click(screen.getByRole('button', { name: /Watermark/ }))
    await waitFor(() => expect(screen.getByText(/2 of 2 finished/)).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Download 2 as ZIP' }))
    await waitFor(() => expect(downloads).toHaveBeenCalledTimes(1))
    expect(downloads.mock.calls[0]?.[1]).toBe('watermarked-2-documents.zip')
  })

  it('reports a per-file failure without stopping the batch', async () => {
    const user = await openDocuments()

    await user.upload(screen.getByLabelText('Add PDFs'), [
      new File([new Uint8Array([1, 2, 3, 4])], 'broken.pdf', { type: 'application/pdf' }),
      await pdfFile('good.pdf', [[300, 400]]),
    ])
    await user.click(screen.getByRole('checkbox', { name: 'Studio signature' }))
    await user.click(screen.getByRole('button', { name: /Watermark/ }))

    await waitFor(() => expect(screen.getByText(/2 of 2 finished, 1 failed/)).toBeInTheDocument())
    const list = screen.getByRole('list', { name: 'Documents to watermark' })
    expect(within(list).getByRole('alert')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Download good-watermarked.pdf' }),
    ).toBeInTheDocument()
  })

  it('removes a queued file and clears the list', async () => {
    const user = await openDocuments()
    await user.upload(screen.getByLabelText('Add PDFs'), [
      await pdfFile('one.pdf', [[300, 400]]),
      await pdfFile('two.pdf', [[300, 400]]),
    ])
    expect(
      await screen.findByRole('heading', { level: 2, name: '2 documents' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove one.pdf' }))
    expect(screen.getByRole('heading', { level: 2, name: '1 document' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear list' }))
    expect(screen.queryByRole('list', { name: 'Documents to watermark' })).not.toBeInTheDocument()
  })

  it('reports a shared-step failure and stops the batch', async () => {
    fakeRasterControls.prepareError = new Error('a logo could not be loaded')
    const user = await openDocuments()
    await user.upload(screen.getByLabelText('Add PDFs'), await pdfFile('a.pdf', [[300, 400]]))
    await user.click(screen.getByRole('checkbox', { name: 'Studio signature' }))
    await user.click(screen.getByRole('button', { name: /Watermark/ }))

    expect(await screen.findByText('a logo could not be loaded')).toBeInTheDocument()
    // Nothing was rasterised, and no result is offered.
    expect(rasterisedSizes).toEqual([])
    expect(screen.queryByRole('button', { name: /Download/ })).not.toBeInTheDocument()
  })

  it('adds through the button, de-duplicates, ignores drag-over, and toggles presets', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    installLibraryApi({
      watermarks: [makeWatermark(), makeWatermark({ id: 'wm-2', name: 'Corner mark' })],
    })
    renderApp('/app/documents')
    const input = await screen.findByLabelText('Add PDFs')

    // The visible button forwards to the hidden input.
    await user.click(screen.getByRole('button', { name: 'Add PDFs' }))

    await user.upload(input, await pdfFile('one.pdf', [[300, 400]]))
    // A second add merges over the non-empty list, dropping the duplicate.
    await user.upload(input, [
      await pdfFile('one.pdf', [[300, 400]]),
      await pdfFile('two.pdf', [[300, 400]]),
    ])
    expect(
      await screen.findByRole('heading', { level: 2, name: '2 documents' }),
    ).toBeInTheDocument()

    // Drag-over is accepted (default prevented) and changes nothing.
    const dropZone = input.parentElement
    if (dropZone === null) {
      throw new Error('drop zone not found')
    }
    fireEvent.dragOver(dropZone)
    expect(screen.getByRole('heading', { level: 2, name: '2 documents' })).toBeInTheDocument()

    // Ticking a second preset filters the existing selection; unticking filters
    // again. Regex names because the order badge joins the label once ticked.
    await user.click(screen.getByRole('checkbox', { name: /Studio signature/ }))
    await user.click(screen.getByRole('checkbox', { name: /Corner mark/ }))
    await user.click(screen.getByRole('checkbox', { name: /Corner mark/ }))
    expect(screen.getByRole('checkbox', { name: /Studio signature/ })).toBeChecked()
  })

  it('points at the library when there are no presets', async () => {
    seedOwnerWorkspace(client())
    installLibraryApi()
    renderApp('/app/documents')
    expect(
      await screen.findByRole('link', { name: 'Create a preset in the library' }),
    ).toBeInTheDocument()
  })
})
