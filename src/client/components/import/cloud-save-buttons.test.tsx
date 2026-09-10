import { act, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import { CloudSaveButtons } from './cloud-save-buttons'
import type { PublicConfig } from '../../../shared/api'
import { CloudBatchError, type CloudSavedFile } from '../../lib/imports/cloud-transfer'
import { saveToDropbox } from '../../lib/imports/dropbox-save'
import { saveToGoogleDrive } from '../../lib/imports/google-drive-save'
import { saveToOneDrive } from '../../lib/imports/onedrive'
import type { CloudUpload } from '../../lib/imports/source'
import { ACCOUNT_CHANGED_EVENT } from '../../lib/offline-account'
import { setOfflineUser } from '../../lib/offline-context'
import { ALL_CLOUD_CONFIG as ALL, NO_CLOUD_CONFIG as NONE } from '../../test-support/cloud-config'
import { fakeCloudSaver } from '../../test-support/fake-cloud-save'

beforeEach(() => {
  setOfflineUser('user-1')
  googleMock.mockImplementation(fakeCloudSaver('google'))
  dropboxMock.mockImplementation(fakeCloudSaver('dropbox'))
  oneDriveMock.mockImplementation(fakeCloudSaver('onedrive'))
})

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
  it('reports partial progress and keeps confirmed files available for management', async () => {
    const file: CloudSavedFile = {
      provider: 'google',
      id: 'confirmed',
      name: 'one.jpg',
      manageUrl: 'https://drive.google.com/file/d/confirmed/view',
      userId: 'user-1',
    }
    googleMock.mockRejectedValue(new CloudBatchError([file], 2, 3, new Error('quota')))
    const { user, onSaved, onError } = setup(ALL)
    await user.click(screen.getByRole('button', { name: 'Save to Google Drive' }))
    await screen.findByRole('button', { name: 'Saved cloud files (1)' })
    expect(onSaved).toHaveBeenCalledWith('google', 1)
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('1 of 3 files confirmed saved'))
  })

  it('suppresses old-account results and clears provider file references on account change', async () => {
    const pending = Promise.withResolvers<CloudSavedFile[]>()
    googleMock.mockImplementation(() => pending.promise)
    const { user, onSaved, onError } = setup(ALL)
    await user.click(screen.getByRole('button', { name: 'Save to Google Drive' }))
    await act(async () => {
      setOfflineUser('other')
      window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT))
      pending.resolve([
        {
          provider: 'google',
          id: 'private-file',
          name: 'private-name.jpg',
          manageUrl: 'https://drive.google.com/file/d/private/view',
          userId: 'user-1',
        },
      ])
      await Promise.resolve()
    })
    expect(onSaved).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /Saved cloud files/ })).not.toBeInTheDocument()
    expect(screen.queryByText('private-name.jpg')).not.toBeInTheDocument()
  })
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
    oneDriveMock.mockImplementation(fakeCloudSaver('onedrive'))
    const { user, onSaved, onError } = setup(ALL)

    await user.click(screen.getByRole('button', { name: 'Save to OneDrive' }))

    await waitFor(() => expect(oneDriveMock).toHaveBeenCalledWith(ALL, expect.any(Function)))
    expect(onSaved).toHaveBeenCalledWith('onedrive', 1)
    expect(onError).not.toHaveBeenCalled()
  })

  it('does nothing when there is nothing to save', async () => {
    const { user, onSaved, onError } = setup(ALL, () => [])

    await user.click(screen.getByRole('button', { name: 'Save to Dropbox' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save to Dropbox' })).toBeEnabled(),
    )
    expect(dropboxMock).toHaveBeenCalledWith(ALL, expect.any(Function))
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
