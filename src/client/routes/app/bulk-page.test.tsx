import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FILTER_BY_ID, IDENTITY_ADJUSTMENTS } from '../../../shared/adjustments'
import { seedOwnerWorkspace } from '../../test-support/fake-auth-client'
import { fakeAuth, installFakeAuth } from '../../test-support/fake-auth-module'
import {
  disposed,
  releaseSlow,
  resetFakeBulkRuntime,
  runs,
} from '../../test-support/fake-bulk-runtime'
import { downloads } from '../../test-support/fake-download'
import { installLibraryApi, makeWatermark } from '../../test-support/fake-library-api'
import { renderApp } from '../../test-support/render-app'

vi.mock('../../lib/auth-client', () => import('../../test-support/fake-auth-module'))
vi.mock('../../bulk/runtime', () => import('../../test-support/fake-bulk-runtime'))
vi.mock('../../lib/thumbnail', () => import('../../test-support/fake-thumbnail'))
vi.mock('../../lib/download', () => import('../../test-support/fake-download'))
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

type TestUser = ReturnType<typeof userEvent.setup>

/** Seeds the workspace, renders the bulk page, adds one.jpg and two.jpg, and ticks the one preset. */
async function addTwoPhotoBatch(): Promise<TestUser> {
  const user = userEvent.setup()
  seedOwnerWorkspace(client())
  installLibraryApi({ watermarks: [makeWatermark()] })
  renderApp('/app/bulk')
  await screen.findByLabelText('Add photos')
  await user.upload(screen.getByLabelText('Add photos'), [photo('one.jpg'), photo('two.jpg')])
  await user.click(screen.getByRole('checkbox', { name: 'Studio signature' }))
  return user
}

beforeEach(() => {
  installFakeAuth()
  resetFakeBulkRuntime()
  downloads.mockClear()
  zipEntries.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('bulk page', () => {
  it('runs a batch with progress, isolates failures, retries them, and downloads a ZIP', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    const second = makeWatermark({ id: 'wm-2', name: 'Corner glyph' })
    installLibraryApi({ watermarks: [makeWatermark(), second] })
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

    // Ticked in reverse library order: the batch applies presets in the order ticked.
    await user.click(screen.getByRole('checkbox', { name: 'Corner glyph' }))
    await user.click(screen.getByRole('checkbox', { name: 'Studio signature' }))
    expect(screen.getByText(/applied in the order ticked/)).toBeInTheDocument()
    await user.click(screen.getByRole('combobox', { name: 'Size' }))
    await user.click(await screen.findByRole('option', { name: 'Fit 2048 px' }))
    await user.click(screen.getByRole('button', { name: 'Start' }))

    await waitFor(() => expect(screen.getByText(/2 of 2 finished, 1 failed/)).toBeInTheDocument())
    expect(runs.map((run) => run.name)).toEqual(['one.jpg', 'fail-three.jpg'])
    expect(runs[0]?.settings).toEqual({
      output: { format: 'image/jpeg', quality: 0.9, metadata: 'strip' },
      fitLongestSide: 2048,
      orientation: { turns: 0, flipX: false, flipY: false },
      adjust: IDENTITY_ADJUSTMENTS,
      border: null,
      namePattern: '{name}-watermarked',
      presetName: expect.any(String),
    })
    expect(runs[0]?.specs).toEqual([second.spec, makeWatermark().spec])
    expect(screen.getByRole('alert')).toHaveTextContent('cannot decode fail-three.jpg')
    expect(screen.getByRole('progressbar', { name: 'Batch progress' })).toHaveAttribute(
      'value',
      '2',
    )

    await user.click(screen.getByRole('button', { name: 'Download one-watermarked.jpg' }))
    expect(downloads).toHaveBeenLastCalledWith(expect.any(Blob), 'one-watermarked.jpg')

    await user.click(screen.getByRole('button', { name: 'Retry 1' }))
    await waitFor(() => expect(screen.getByText(/2 of 2 finished, 1 failed/)).toBeInTheDocument())
    expect(runs).toHaveLength(3)

    await user.click(screen.getByRole('button', { name: 'Download 1 as ZIP' }))
    await waitFor(() => expect(downloads).toHaveBeenCalledTimes(2))
    expect(zipEntries.mock.calls[0]?.[0].map((entry) => entry.name)).toEqual([
      'one-watermarked.jpg',
    ])
    expect(downloads.mock.calls[1]?.[1]).toBe('watermarked-1-photos.zip')
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
    await user.click(screen.getByRole('checkbox', { name: 'Studio signature' }))
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
    const list = screen.getByRole('list', { name: 'Photos in this batch' })
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
    expect(screen.queryByRole('list', { name: 'Photos in this batch' })).not.toBeInTheDocument()
    unmount()
    expect(disposed.count).toBe(1)
  })

  it('saves a finished batch to the gallery, counting failures', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    const api = installLibraryApi({ watermarks: [makeWatermark()] })
    renderApp('/app/bulk')
    await screen.findByLabelText('Add photos')
    await user.upload(screen.getByLabelText('Add photos'), [photo('a.jpg'), photo('b.jpg')])
    await user.click(screen.getByRole('checkbox', { name: 'Studio signature' }))
    await user.click(screen.getByRole('button', { name: 'Start' }))
    await waitFor(() => expect(screen.getByText(/2 of 2 finished in/)).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Save 2 to gallery' }))
    expect(await screen.findByText(/All saved to the/)).toBeInTheDocument()
    expect(api.gallery.photos.map((stored) => stored.name)).toEqual([
      'a-watermarked.jpg',
      'b-watermarked.jpg',
    ])
    expect(api.gallery.photos[0]?.presetId).toBe('wm-1')

    api.gallery.uploadFailsWith = 'quotaExceeded'
    await user.click(screen.getByRole('button', { name: 'Start' }))
    await waitFor(() => expect(screen.getByText(/2 of 2 finished in/)).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Save 2 to gallery' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('2 could not be saved')
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
      dataTransfer: {
        files: [
          photo('dropped.jpg'),
          new File([new Uint8Array(1)], 'skip.txt', { type: 'text/plain' }),
        ],
      },
    })
    expect(await screen.findByText('dropped.jpg')).toBeInTheDocument()
    expect(screen.getByText(/1 file skipped: not images/)).toBeInTheDocument()
  })

  it('applies a batch orientation and filter to every photo', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    installLibraryApi({ watermarks: [makeWatermark()] })
    renderApp('/app/bulk')
    await screen.findByLabelText('Add photos')
    await user.upload(screen.getByLabelText('Add photos'), [photo('a.jpg'), photo('b.jpg')])
    await user.click(screen.getByRole('checkbox', { name: 'Studio signature' }))

    await user.click(screen.getByText('Photo adjustments'))
    await user.click(screen.getByRole('button', { name: 'Rotate left' }))
    await user.click(screen.getByRole('radio', { name: 'Sepia' }))

    await user.click(screen.getByRole('button', { name: 'Start' }))
    await waitFor(() => expect(screen.getByText(/2 of 2 finished in/)).toBeInTheDocument())
    // Rotate left from zero is three quarter-turns clockwise.
    expect(runs[0]?.settings.orientation).toEqual({ turns: 3, flipX: false, flipY: false })
    expect(runs[0]?.settings.adjust).toEqual(FILTER_BY_ID.sepia.adjust)
  })

  it('applies a file-name pattern and downloads a CSV report', async () => {
    const user = await addTwoPhotoBatch()

    fireEvent.change(screen.getByLabelText('File names'), { target: { value: '{index}-{name}' } })
    await user.click(screen.getByRole('button', { name: 'Start' }))
    await waitFor(() => expect(screen.getByText(/2 of 2 finished/)).toBeInTheDocument())

    expect(runs[0]?.settings.namePattern).toBe('{index}-{name}')
    expect(screen.getByRole('button', { name: 'Download 1-one.jpg' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Download report/ }))
    expect(downloads).toHaveBeenLastCalledWith(expect.any(Blob), 'report.csv')
  })

  it('warns when the name pattern resolves to an empty name', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    installLibraryApi({ watermarks: [makeWatermark()] })
    renderApp('/app/bulk')
    await screen.findByLabelText('Add photos')
    await user.upload(screen.getByLabelText('Add photos'), [photo('a.jpg')])
    fireEvent.change(screen.getByLabelText('File names'), { target: { value: ' '.repeat(3) } })
    expect(screen.getByText(/must produce a name/)).toBeInTheDocument()
  })

  it('pauses a running batch and resumes it', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    installLibraryApi({ watermarks: [makeWatermark()] })
    renderApp('/app/bulk')
    await screen.findByLabelText('Add photos')
    await user.upload(screen.getByLabelText('Add photos'), [
      photo('slow-a.png'),
      photo('slow-b.png'),
      photo('slow-c.png'),
    ])
    await user.click(screen.getByRole('checkbox', { name: 'Studio signature' }))
    await user.click(screen.getByRole('button', { name: 'Start' }))

    await user.click(await screen.findByRole('button', { name: 'Pause' }))
    expect(await screen.findByRole('button', { name: 'Resume' })).toBeInTheDocument()
    releaseSlow()
    await user.click(screen.getByRole('button', { name: 'Resume' }))
    releaseSlow()
    await waitFor(() => expect(screen.getByText(/3 of 3 finished/)).toBeInTheDocument())
  })

  it('adjusts one photo of a batch and re-runs just that job', async () => {
    const user = await addTwoPhotoBatch()
    await user.click(screen.getByRole('button', { name: 'Start' }))
    await waitFor(() => expect(screen.getByText(/2 of 2 finished/)).toBeInTheDocument())
    const runsBefore = runs.length

    await user.click(screen.getByRole('button', { name: 'Adjust one.jpg' }))
    await user.click(await screen.findByRole('button', { name: 'Apply to this photo' }))

    await waitFor(() => expect(runs.length).toBeGreaterThan(runsBefore))
    expect(runs.at(-1)?.override).not.toBeNull()
    expect(screen.getByText('Custom')).toBeInTheDocument()
  })

  it('pushes one photo’s edits to the whole batch and removes a single override', async () => {
    const user = await addTwoPhotoBatch()
    await user.click(screen.getByRole('button', { name: 'Start' }))
    await waitFor(() => expect(screen.getByText(/2 of 2 finished/)).toBeInTheDocument())

    // "Apply to all photos" re-runs every job and leaves no per-photo override.
    await user.click(screen.getByRole('button', { name: 'Adjust one.jpg' }))
    const beforeAll = runs.length
    await user.click(await screen.findByRole('button', { name: 'Apply to all photos' }))
    await waitFor(() => expect(runs.length).toBeGreaterThan(beforeAll))
    expect(screen.queryByText('Custom')).not.toBeInTheDocument()

    // Override just two.jpg, then re-open it and remove that override.
    await user.click(screen.getByRole('button', { name: 'Adjust two.jpg' }))
    await user.click(await screen.findByRole('button', { name: 'Apply to this photo' }))
    expect(await screen.findByText('Custom')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Adjust two.jpg' }))
    await user.click(await screen.findByRole('button', { name: 'Remove override' }))
    await waitFor(() => expect(screen.queryByText('Custom')).not.toBeInTheDocument())
  })

  it('caps the visible rows and expands on request', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    installLibraryApi({ watermarks: [makeWatermark()] })
    renderApp('/app/bulk')
    await screen.findByLabelText('Add photos')
    await user.upload(
      screen.getByLabelText('Add photos'),
      Array.from({ length: 61 }, (_, index) => photo(`p${String(index)}.jpg`)),
    )
    const list = screen.getByRole('list', { name: 'Photos in this batch' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(60)
    await user.click(screen.getByRole('button', { name: /Show all 61 photos/ }))
    expect(within(list).getAllByRole('listitem')).toHaveLength(61)
  })
})
