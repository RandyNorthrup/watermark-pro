import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { seedOwnerWorkspace } from '../../test-support/fake-auth-client'
import { fakeAuth, installFakeAuth } from '../../test-support/fake-auth-module'
import {
  disposed,
  releaseSlow,
  resetFakeBulkRuntime,
  runs,
} from '../../test-support/fake-bulk-runtime'
import { installLibraryApi, makeWatermark } from '../../test-support/fake-library-api'
import { renderApp } from '../../test-support/render-app'

vi.mock('../../lib/auth-client', () => import('../../test-support/fake-auth-module'))
vi.mock('../../bulk/runtime', () => import('../../test-support/fake-bulk-runtime'))
const downloadBlob = vi.fn<(blob: Blob, fileName: string) => void>()
vi.mock('../../lib/download', () => ({
  downloadBlob: (blob: Blob, fileName: string) => {
    downloadBlob(blob, fileName)
  },
}))
const zipEntries = vi.fn((entries: { name: string }[]) =>
  Promise.resolve(
    new Blob([entries.map((entry) => entry.name).join(',')], { type: 'application/zip' }),
  ),
)
vi.mock('../../bulk/zip', () => ({
  zipEntries: (entries: { name: string }[]) => zipEntries(entries),
}))

const client = fakeAuth

function photo(name: string, size = 2048): File {
  return new File([new Uint8Array(size)], name, { type: 'image/jpeg' })
}

beforeEach(() => {
  installFakeAuth()
  resetFakeBulkRuntime()
  downloadBlob.mockClear()
  zipEntries.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('bulk page', () => {
  it('runs a batch with progress, isolates failures, retries them, and downloads a ZIP', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    installLibraryApi({ watermarks: [makeWatermark()] })
    renderApp('/app/bulk')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Bulk watermarking')
    expect(await screen.findByText(/using 2 workers/)).toBeInTheDocument()

    await user.upload(screen.getByLabelText('Add photos'), [
      photo('one.jpg'),
      photo('two.jpg', 3 * 1024 * 1024),
      photo('fail-three.jpg'),
      photo('one.jpg'),
    ])
    expect(screen.getByRole('heading', { level: 2, name: '3 photos' })).toBeInTheDocument()
    expect(screen.getByText('3.0 MB')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Remove two.jpg' }))
    expect(screen.getByRole('heading', { level: 2, name: '2 photos' })).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Preset'), 'wm-1')
    await user.click(screen.getByRole('combobox', { name: 'Size' }))
    await user.click(await screen.findByRole('option', { name: 'Fit 2048 px' }))
    await user.click(screen.getByRole('button', { name: 'Start' }))

    await waitFor(() => expect(screen.getByText(/2 of 2 finished, 1 failed/)).toBeInTheDocument())
    expect(runs.map((run) => run.name)).toEqual(['one.jpg', 'fail-three.jpg'])
    expect(runs[0]?.settings).toEqual({
      output: { format: 'image/jpeg', quality: 0.9 },
      fitLongestSide: 2048,
    })
    expect(runs[0]?.spec).toEqual(makeWatermark().spec)
    expect(screen.getByRole('alert')).toHaveTextContent('cannot decode fail-three.jpg')
    expect(screen.getByRole('progressbar', { name: 'Batch progress' })).toHaveAttribute(
      'value',
      '2',
    )

    await user.click(screen.getByRole('button', { name: 'Download one-watermarked.jpg' }))
    expect(downloadBlob).toHaveBeenLastCalledWith(expect.any(Blob), 'one-watermarked.jpg')

    await user.click(screen.getByRole('button', { name: 'Retry 1' }))
    await waitFor(() => expect(screen.getByText(/2 of 2 finished, 1 failed/)).toBeInTheDocument())
    expect(runs).toHaveLength(3)

    await user.click(screen.getByRole('button', { name: 'Download 1 as ZIP' }))
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(2))
    expect(zipEntries.mock.calls[0]?.[0].map((entry) => entry.name)).toEqual([
      'one-watermarked.jpg',
    ])
    expect(downloadBlob.mock.calls[1]?.[1]).toBe('watermarked-1-photos.zip')
  })

  it('cancels a running batch, keeps finished results, and reports ZIP failures', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    installLibraryApi({ watermarks: [makeWatermark()] })
    const { unmount } = renderApp('/app/bulk')
    await screen.findByLabelText('Add photos')
    await user.upload(screen.getByLabelText('Add photos'), [
      photo('quick.png'),
      photo('slow-a.png'),
      photo('slow-b.png'),
      photo('slow-c.png'),
    ])
    await user.selectOptions(screen.getByLabelText('Preset'), 'wm-1')
    await user.click(screen.getByRole('combobox', { name: 'Format' }))
    await user.click(await screen.findByRole('option', { name: 'PNG' }))
    expect(screen.getByLabelText('Quality')).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Start' }))

    await waitFor(() => expect(screen.getAllByText('Processing')).toHaveLength(2))
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() =>
      expect(
        screen.getByText(/1 of 4 finished, 3 cancelled|4 of 4 finished, 3 cancelled/),
      ).toBeInTheDocument(),
    )
    const list = screen.getByRole('list')
    expect(within(list).getAllByText('Cancelled')).toHaveLength(3)
    expect(within(list).getByText('Done')).toBeInTheDocument()

    zipEntries.mockRejectedValueOnce(new Error('archive too large'))
    await user.click(screen.getByRole('button', { name: 'Download 1 as ZIP' }))
    expect(await screen.findByText('archive too large')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry 3' }))
    await waitFor(() => expect(screen.getAllByText('Processing')).toHaveLength(2))
    releaseSlow()
    await waitFor(() => expect(screen.getAllByText('Processing')).toHaveLength(1))
    releaseSlow()
    await waitFor(() => expect(screen.getByText(/4 of 4 finished in/)).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Clear list' }))
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    unmount()
    expect(disposed.count).toBe(1)
  })

  it('accepts dropped files and points at the library when there are no presets', async () => {
    seedOwnerWorkspace(client())
    installLibraryApi()
    const { unmount } = renderApp('/app/bulk')
    expect(
      await screen.findByRole('link', { name: 'Create a preset in the library' }),
    ).toBeInTheDocument()
    unmount()

    installLibraryApi({ watermarks: [makeWatermark()] })
    renderApp('/app/bulk')
    const input = await screen.findByLabelText('Add photos')
    const dropZone = input.parentElement
    expect(dropZone).not.toBeNull()
    fireEvent.drop(dropZone!, {
      dataTransfer: { files: [photo('dropped.jpg')] },
    })
    expect(await screen.findByText('dropped.jpg')).toBeInTheDocument()
  })
})
