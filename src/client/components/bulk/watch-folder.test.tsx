import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { WatchFolder } from './watch-folder'
import { IDENTITY_ADJUSTMENTS, IDENTITY_ORIENTATION } from '../../../shared/adjustments'
import { DEFAULT_TEXT_SPEC } from '../../../shared/watermark'
import { DEFAULT_NAME_PATTERN } from '../../bulk/names'
import type { BulkSettings } from '../../bulk/processor'
import { FakeDirectory, imageFile } from '../../test-support/fake-file-system'

vi.mock('../../bulk/runtime', () => import('../../test-support/fake-bulk-runtime'))

const SETTINGS: BulkSettings = {
  output: { format: 'image/jpeg', quality: 0.9, metadata: 'strip' },
  fitLongestSide: null,
  orientation: { turns: IDENTITY_ORIENTATION.turns, flipX: false, flipY: false },
  adjust: IDENTITY_ADJUSTMENTS,
  border: null,
  namePattern: DEFAULT_NAME_PATTERN,
  presetName: 'Preset',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('WatchFolder', () => {
  it('watches an input folder and writes results to the output folder', async () => {
    const input = new FakeDirectory()
    input.put('shot.png', imageFile('shot.png', 1))
    const output = new FakeDirectory()
    const picker = vi.fn().mockResolvedValueOnce(input).mockResolvedValueOnce(output)
    vi.stubGlobal('showDirectoryPicker', picker)

    const user = userEvent.setup()
    render(<WatchFolder organizationId="org-1" specs={[DEFAULT_TEXT_SPEC]} settings={SETTINGS} />)

    await user.click(screen.getByRole('button', { name: 'Choose folders' }))
    expect(picker).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(output.written.has('shot-watermarked.jpg')).toBe(true))
    expect(await screen.findByText(/Wrote shot-watermarked\.jpg/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Stop' }))
    expect(screen.getByRole('button', { name: 'Choose folders' })).toBeInTheDocument()
  })

  it('surfaces an error when the input folder cannot be read', async () => {
    const input = new FakeDirectory()
    input.fail = true
    const output = new FakeDirectory()
    vi.stubGlobal(
      'showDirectoryPicker',
      vi.fn().mockResolvedValueOnce(input).mockResolvedValueOnce(output),
    )

    const user = userEvent.setup()
    render(<WatchFolder organizationId="org-1" specs={[DEFAULT_TEXT_SPEC]} settings={SETTINGS} />)
    await user.click(screen.getByRole('button', { name: 'Choose folders' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot read the folder/)
  })

  it('renders nothing where the File System Access API is missing', () => {
    render(<WatchFolder organizationId="org-1" specs={[DEFAULT_TEXT_SPEC]} settings={SETTINGS} />)
    expect(screen.queryByRole('button', { name: 'Choose folders' })).not.toBeInTheDocument()
  })
})
