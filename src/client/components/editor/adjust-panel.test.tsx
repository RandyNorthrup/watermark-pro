import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AdjustPanel } from './adjust-panel'
import { FILTER_BY_ID, FILTER_IDS, IDENTITY_ADJUSTMENTS } from '../../../shared/adjustments'

const renderFilterThumbnails = vi.fn((_source: unknown, _backend: unknown) =>
  Promise.resolve(new Map(FILTER_IDS.map((id) => [id, `blob:${id}`]))),
)

vi.mock('../../lib/filter-thumbnails', () => ({
  renderFilterThumbnails: (source: unknown, backend: unknown) =>
    renderFilterThumbnails(source, backend),
  FILTER_THUMBNAIL_SIDE: 96,
}))
vi.mock('../../lib/canvas-backend', () => ({ mainThreadBackend: () => ({}) }))

const revokeObjectURL = vi.fn()

beforeEach(() => {
  renderFilterThumbnails.mockClear()
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL })
  revokeObjectURL.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AdjustPanel', () => {
  it('renders filter thumbnails, resets one channel, and reports a custom look', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { container, rerender, unmount } = render(
      <AdjustPanel adjust={IDENTITY_ADJUSTMENTS} onChange={onChange} photoFile={null} />,
    )

    // The thumbnail render succeeds (mocked), so every filter shows an image.
    await waitFor(() =>
      expect(container.querySelectorAll('img[src^="blob:"]')).toHaveLength(FILTER_IDS.length),
    )
    expect(screen.getByText('Filter: Original')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Vivid' }))
    expect(onChange).toHaveBeenLastCalledWith(FILTER_BY_ID.vivid.adjust)

    // A non-identity look shows the per-channel reset as enabled and "Custom".
    rerender(
      <AdjustPanel
        adjust={{ ...IDENTITY_ADJUSTMENTS, contrast: 0.4 }}
        onChange={onChange}
        photoFile={null}
      />,
    )
    expect(screen.getByText('Custom adjustments')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reset Contrast' }))
    expect(onChange).toHaveBeenLastCalledWith({ ...IDENTITY_ADJUSTMENTS, contrast: 0 })

    unmount()
    expect(revokeObjectURL).toHaveBeenCalled()
  })

  it('decodes a chosen photo for its thumbnails', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.resolve({ close: vi.fn() })),
    )
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' })
    render(<AdjustPanel adjust={IDENTITY_ADJUSTMENTS} onChange={vi.fn()} photoFile={file} />)
    await waitFor(() => expect(createImageBitmap).toHaveBeenCalledWith(file))
    expect(renderFilterThumbnails).toHaveBeenCalled()
  })
})
