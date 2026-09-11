import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import { ExportPanel } from './export-panel'
import type { Size } from '../../engine/layout'
import { saveToGoogleDrive } from '../../lib/imports/google-drive-save'
import type { CloudUpload, CloudUploadSource } from '../../lib/imports/source'
import { setOfflineUser } from '../../lib/offline-context'
import { ALL_CLOUD_CONFIG } from '../../test-support/cloud-config'
import { fakeCloudSaver } from '../../test-support/fake-cloud-save'

beforeEach(() => {
  setOfflineUser('user-1')
})

vi.mock('../../lib/imports/google-drive-save', () => ({ saveToGoogleDrive: vi.fn() }))
vi.mock('../../lib/imports/dropbox-save', () => ({
  saveToDropbox: vi.fn(async (_config: unknown, source: CloudUploadSource) => {
    if (typeof source === 'function') await source()
    return []
  }),
}))
vi.mock('../../lib/imports/onedrive', () => ({ saveToOneDrive: vi.fn() }))

const googleSaveMock = vi.mocked(saveToGoogleDrive)

const SIZE: Size = { width: 800, height: 600 }
const UPLOAD: CloudUpload = { name: 'photo-watermarked.jpg', blob: new Blob(['x']) }

afterEach(() => {
  googleSaveMock.mockReset()
})

function renderPanel(onExportBlob: () => Promise<CloudUpload | null>) {
  const onCloudSaved = vi.fn()
  const onCloudError = vi.fn()
  render(
    <ExportPanel
      outputSize={SIZE}
      isReady
      isExporting={false}
      onExport={vi.fn()}
      onShare={vi.fn()}
      isSharing={false}
      onSave={vi.fn()}
      organizationName="Acme"
      cloudConfig={ALL_CLOUD_CONFIG}
      onExportBlob={onExportBlob}
      onCloudSaved={onCloudSaved}
      onCloudError={onCloudError}
    />,
  )
  return { user: userEvent.setup(), onCloudSaved, onCloudError }
}

describe('ExportPanel cloud save', () => {
  it('shows a save button for each configured provider', () => {
    renderPanel(() => Promise.resolve(UPLOAD))
    expect(screen.getByRole('button', { name: 'Save to Google Drive' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save to Dropbox' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save to OneDrive' })).toBeInTheDocument()
  })

  it('renders every destination as one uniform full-width action', () => {
    renderPanel(() => Promise.resolve(UPLOAD))
    for (const name of [
      'Download',
      'Save to gallery',
      'Save to Google Drive',
      'Save to Dropbox',
      'Save to OneDrive',
    ]) {
      expect(screen.getByRole('button', { name })).toHaveClass('h-11', 'w-full', 'justify-start')
    }
  })

  it('renders the current photo and confirms a successful save', async () => {
    googleSaveMock.mockImplementation(fakeCloudSaver('google'))
    const onExportBlob = vi.fn(() => Promise.resolve(UPLOAD))
    const { user, onCloudSaved, onCloudError } = renderPanel(onExportBlob)

    await user.click(screen.getByRole('button', { name: 'Save to Google Drive' }))

    await waitFor(() =>
      expect(googleSaveMock).toHaveBeenCalledWith(ALL_CLOUD_CONFIG, expect.any(Function)),
    )
    expect(onExportBlob).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(onCloudSaved).toHaveBeenCalledWith('Saved to your Google Drive “Lumafoil” folder.'),
    )
    expect(onCloudError).not.toHaveBeenCalled()
  })

  it('saves nothing when the photo cannot be rendered', async () => {
    const { user, onCloudSaved, onCloudError } = renderPanel(() => Promise.resolve(null))

    await user.click(screen.getByRole('button', { name: 'Save to Dropbox' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save to Dropbox' })).toBeEnabled(),
    )
    expect(googleSaveMock).not.toHaveBeenCalled()
    expect(onCloudSaved).not.toHaveBeenCalled()
    expect(onCloudError).not.toHaveBeenCalled()
  })

  it('reports a save failure through onCloudError', async () => {
    googleSaveMock.mockRejectedValue(new Error('Drive rejected the upload'))
    const { user, onCloudSaved, onCloudError } = renderPanel(() => Promise.resolve(UPLOAD))

    await user.click(screen.getByRole('button', { name: 'Save to Google Drive' }))

    await waitFor(() => expect(onCloudError).toHaveBeenCalledWith('Drive rejected the upload'))
    expect(onCloudSaved).not.toHaveBeenCalled()
  })

  it('offers an invisible mark on PNG and blocks an over-long message', async () => {
    const { user } = renderPanel(() => Promise.resolve(UPLOAD))
    // Default JPEG shows the "choose PNG" hint; the invisible checkbox is disabled.
    expect(screen.getByText(/Choose PNG to hide a message/)).toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: 'Format' }))
    await user.click(await screen.findByRole('option', { name: 'PNG' }))
    await user.click(screen.getByRole('checkbox', { name: 'Invisible mark' }))

    // Seeded from the organization name; a message that fits keeps Download enabled.
    const message = screen.getByLabelText('Invisible message')
    expect(message).toHaveValue('Acme')
    expect(screen.getByRole('button', { name: 'Download' })).toBeEnabled()

    // Over the pixel budget: the panel warns and blocks export.
    fireEvent.change(message, { target: { value: 'x'.repeat(100_000) } })
    expect(screen.getByText(/Too long for a/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download' })).toBeDisabled()
  })
})
