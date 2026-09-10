import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import { CloudImportButtons } from './cloud-import-buttons'
import type { PublicConfig } from '../../../shared/api'
import { pickFromDropbox } from '../../lib/imports/dropbox-chooser'
import { pickFromGoogleDrive } from '../../lib/imports/google-picker'
import { setOfflineUser } from '../../lib/offline-context'
import { ALL_CLOUD_CONFIG as ALL, NO_CLOUD_CONFIG as NONE } from '../../test-support/cloud-config'

beforeEach(() => setOfflineUser('user-1'))

vi.mock('../../lib/imports/google-picker', () => ({ pickFromGoogleDrive: vi.fn() }))
vi.mock('../../lib/imports/dropbox-chooser', () => ({ pickFromDropbox: vi.fn() }))
// The OneDrive browse dialog pulls in MSAL; stub it to its trigger so this test
// stays a pure render/orchestration check of the button row.
vi.mock('./onedrive-dialog', () => ({
  OneDriveDialog: ({ trigger }: { trigger: ReactNode }) => <>{trigger}</>,
}))

const googleMock = vi.mocked(pickFromGoogleDrive)
const dropboxMock = vi.mocked(pickFromDropbox)

afterEach(() => {
  googleMock.mockReset()
  dropboxMock.mockReset()
})

function setup(config: PublicConfig) {
  const onImport = vi.fn()
  const onError = vi.fn()
  render(<CloudImportButtons config={config} onImport={onImport} onError={onError} />)
  return { user: userEvent.setup(), onImport, onError }
}

describe('CloudImportButtons', () => {
  it('renders nothing when no provider is configured', () => {
    const { container } = render(
      <CloudImportButtons config={NONE} onImport={vi.fn()} onError={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders one button per configured provider', () => {
    setup(ALL)
    expect(screen.getByRole('button', { name: 'Google Drive' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dropbox' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'OneDrive' })).toBeInTheDocument()
  })

  it('omits a provider whose keys are only partially configured', () => {
    setup({ ...NONE, googleOAuthClientId: 'client', dropboxAppKey: 'dbx' })
    expect(screen.queryByRole('button', { name: 'Google Drive' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dropbox' })).toBeInTheDocument()
  })

  it('forwards the chosen files to onImport', async () => {
    const file = new File([new Uint8Array([1])], 'drive.png', { type: 'image/png' })
    googleMock.mockResolvedValue([file])
    const { user, onImport, onError } = setup(ALL)

    await user.click(screen.getByRole('button', { name: 'Google Drive' }))

    await waitFor(() => expect(onImport).toHaveBeenCalledWith([file]))
    expect(onError).not.toHaveBeenCalled()
  })

  it('does not call onImport when the picker is cancelled (no files)', async () => {
    dropboxMock.mockResolvedValue([])
    const { user, onImport, onError } = setup(ALL)

    await user.click(screen.getByRole('button', { name: 'Dropbox' }))

    await waitFor(() => expect(dropboxMock).toHaveBeenCalledTimes(1))
    expect(onImport).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it('reports a picker failure through onError', async () => {
    googleMock.mockRejectedValue(new Error('Google said no'))
    const { user, onImport, onError } = setup(ALL)

    await user.click(screen.getByRole('button', { name: 'Google Drive' }))

    await waitFor(() => expect(onError).toHaveBeenCalledWith('Google said no'))
    expect(onImport).not.toHaveBeenCalled()
  })
})
