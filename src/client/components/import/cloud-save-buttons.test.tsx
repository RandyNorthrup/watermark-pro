import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CloudSaveButtons } from './cloud-save-buttons'
import type { PublicConfig } from '../../../shared/api'
import { saveToDropbox } from '../../lib/imports/dropbox-save'
import { saveToGoogleDrive } from '../../lib/imports/google-drive-save'
import { saveToOneDrive } from '../../lib/imports/onedrive'
import type { CloudUpload } from '../../lib/imports/source'
import { ALL_CLOUD_CONFIG as ALL, NO_CLOUD_CONFIG as NONE } from '../../test-support/cloud-config'

vi.mock('../../lib/imports/google-drive-save', () => ({ saveToGoogleDrive: vi.fn() }))
vi.mock('../../lib/imports/dropbox-save', () => ({ saveToDropbox: vi.fn() }))
vi.mock('../../lib/imports/onedrive', () => ({ saveToOneDrive: vi.fn() }))

const googleMock = vi.mocked(saveToGoogleDrive)
const dropboxMock = vi.mocked(saveToDropbox)
const oneDriveMock = vi.mocked(saveToOneDrive)

const UPLOAD: CloudUpload = { name: 'photo-watermarked.jpg', blob: new Blob(['x']) }

afterEach(() => {
  googleMock.mockReset()
  dropboxMock.mockReset()
  oneDriveMock.mockReset()
})

function setup(
  config: PublicConfig,
  getUploads: () => Promise<readonly CloudUpload[]> | readonly CloudUpload[] = () => [UPLOAD],
) {
  const onSaved = vi.fn()
  const onError = vi.fn()
  render(
    <CloudSaveButtons
      config={config}
      getUploads={getUploads}
      onSaved={onSaved}
      onError={onError}
    />,
  )
  return { user: userEvent.setup(), onSaved, onError }
}

describe('CloudSaveButtons', () => {
  it('renders nothing when no provider is configured', () => {
    const { container } = render(
      <CloudSaveButtons config={NONE} getUploads={() => []} onSaved={vi.fn()} onError={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a save button per configured provider', () => {
    setup(ALL)
    expect(screen.getByRole('button', { name: 'Save to Google Drive' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save to Dropbox' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save to OneDrive' })).toBeInTheDocument()
  })

  it('uploads the produced files and reports success', async () => {
    oneDriveMock.mockResolvedValue()
    const { user, onSaved, onError } = setup(ALL)

    await user.click(screen.getByRole('button', { name: 'Save to OneDrive' }))

    await waitFor(() => expect(oneDriveMock).toHaveBeenCalledWith(ALL, [UPLOAD]))
    expect(onSaved).toHaveBeenCalledWith('onedrive', 1)
    expect(onError).not.toHaveBeenCalled()
  })

  it('does nothing when there is nothing to save', async () => {
    const { user, onSaved, onError } = setup(ALL, () => [])

    await user.click(screen.getByRole('button', { name: 'Save to Dropbox' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save to Dropbox' })).toBeEnabled(),
    )
    expect(dropboxMock).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it('reports a save failure through onError', async () => {
    googleMock.mockRejectedValue(new Error('Drive said no'))
    const { user, onSaved, onError } = setup(ALL)

    await user.click(screen.getByRole('button', { name: 'Save to Google Drive' }))

    await waitFor(() => expect(onError).toHaveBeenCalledWith('Drive said no'))
    expect(onSaved).not.toHaveBeenCalled()
  })
})
