import { act, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CloudBrowserDialog } from './cloud-browser-dialog'
import type { CloudConnectionDto, CloudProvider } from '../../../shared/cloud-connections'
import { cloudConnections, connectCloudProvider } from '../../lib/cloud-connections'
import {
  CLOUD_ROOT_FOLDER,
  cloudTargetToken,
  createCloudFolder,
  downloadCloudFile,
  listCloudFolder,
  type CloudBrowserItem,
} from '../../lib/imports/cloud-folders'
import type * as CloudFolders from '../../lib/imports/cloud-folders'
import { pickFromGoogleDrive, pickGoogleDriveFolder } from '../../lib/imports/google-picker'
import { ACCOUNT_CHANGED_EVENT } from '../../lib/offline-account'
import { setOfflineUser } from '../../lib/offline-context'
import { ALL_CLOUD_CONFIG } from '../../test-support/cloud-config'

vi.mock('../../lib/cloud-connections', () => ({
  cloudConnections: vi.fn(),
  connectCloudProvider: vi.fn(),
}))
vi.mock('../../lib/imports/google-picker', () => ({
  pickFromGoogleDrive: vi.fn(),
  pickGoogleDriveFolder: vi.fn(),
}))
vi.mock('../../lib/imports/cloud-folders', async (original) => ({
  ...(await original<typeof CloudFolders>()),
  cloudTargetToken: vi.fn(),
  createCloudFolder: vi.fn(),
  downloadCloudFile: vi.fn(),
  listCloudFolder: vi.fn(),
}))

const TOKEN = {
  accessToken: 'token',
  providerAccountId: 'provider-owner',
  generation: 2,
  expiresAt: '2030-01-01T00:00:00.000Z',
}
const FILE = new File(['ORIGINAL VIDEO'], 'clip.mp4', { type: 'video/mp4' })
const ITEMS: CloudBrowserItem[] = [
  { kind: 'folder', id: 'projects', name: 'Projects', path: '/projects' },
  { kind: 'file', id: 'clip', name: 'clip.mp4', mimeType: 'video/mp4' },
]
function connection(
  provider: CloudProvider = 'google',
  status: CloudConnectionDto['status'] = 'connected',
): CloudConnectionDto {
  return {
    provider,
    status,
    isConfigured: true,
    accessScope: provider === 'dropbox' ? 'app_folder' : 'selected_files',
    accountLabel: 'Provider Owner',
    providerAccountId: TOKEN.providerAccountId,
    generation: TOKEN.generation,
  }
}
function setup(provider: CloudProvider = 'google', mode: 'open' | 'save' = 'open') {
  const onImport = vi.fn()
  const onDestination = vi.fn()
  const onError = vi.fn()
  const onClose = vi.fn()
  const common = {
    provider,
    config: ALL_CLOUD_CONFIG,
    onError,
    onClose,
    mediaKinds: ['video'] as const,
  }
  const view = render(
    mode === 'open' ? (
      <CloudBrowserDialog {...common} mode="open" onImport={onImport} />
    ) : (
      <CloudBrowserDialog {...common} mode="save" onDestination={onDestination} />
    ),
  )
  return { ...view, user: userEvent.setup(), onImport, onDestination, onError, onClose }
}

/** Both close paths begin with the same real, user-triggered pending connection. */
async function startPendingConnection() {
  vi.mocked(cloudConnections).mockResolvedValue({
    connections: [connection('google', 'disconnected')],
  })
  const pending = Promise.withResolvers<undefined>()
  vi.mocked(connectCloudProvider).mockReturnValueOnce(pending.promise)
  const view = setup()
  await view.user.click(await screen.findByRole('button', { name: 'Connect Google Drive' }))
  return { ...view, pending }
}
beforeEach(() => {
  setOfflineUser('owner')
  vi.mocked(cloudConnections).mockResolvedValue({ connections: [connection()] })
  vi.mocked(cloudTargetToken).mockResolvedValue(TOKEN)
  vi.mocked(listCloudFolder).mockResolvedValue(ITEMS)
  vi.mocked(createCloudFolder).mockResolvedValue({ id: 'created', name: 'Exports' })
  vi.mocked(downloadCloudFile).mockResolvedValue(FILE)
  vi.mocked(connectCloudProvider).mockResolvedValue()
  vi.mocked(pickFromGoogleDrive).mockResolvedValue([])
  vi.mocked(pickGoogleDriveFolder).mockResolvedValue(null)
})
afterEach(() => {
  vi.resetAllMocks()
  setOfflineUser(null)
})

describe('cloud browser account and native-picker interactions', () => {
  it('connects only on explicit request, then navigates the saved Dropbox app-folder grant', async () => {
    vi.mocked(cloudConnections)
      .mockResolvedValueOnce({ connections: [connection('dropbox', 'disconnected')] })
      .mockResolvedValue({ connections: [connection('dropbox')] })
    const { user, onImport } = setup('dropbox')
    const connect = await screen.findByRole('button', { name: 'Connect Dropbox' })
    expect(listCloudFolder).not.toHaveBeenCalled()
    await user.click(connect)
    expect(
      await screen.findByText('Dropbox access is limited to the Lumafoil App Folder.'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Projects' }))
    await waitFor(() =>
      expect(listCloudFolder).toHaveBeenLastCalledWith(
        'dropbox',
        'token',
        ITEMS[0],
        ['video'],
        expect.any(AbortSignal),
      ),
    )
    await user.click(screen.getByRole('button', { name: 'Lumafoil App Folder' }))
    await user.click(await screen.findByRole('button', { name: 'clip.mp4' }))
    await user.click(screen.getByRole('button', { name: 'clip.mp4' }))
    expect(screen.getByRole('button', { name: 'Open Selected' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'clip.mp4' }))
    await user.click(screen.getByRole('button', { name: 'Open Selected' }))
    expect(onImport).toHaveBeenCalledWith([FILE])
    expect(connectCloudProvider).toHaveBeenCalledOnce()
  })

  it('creates a folder and uses its account-bound destination instead of the default root', async () => {
    const { user, onDestination, onClose } = setup('google', 'save')
    await screen.findByRole('button', { name: 'Projects' })
    await user.type(screen.getByRole('textbox', { name: 'New Folder Name' }), 'Exports')
    vi.mocked(listCloudFolder).mockResolvedValueOnce([])
    await user.click(screen.getByRole('button', { name: 'Create Folder' }))
    expect(await screen.findByText('No matching files or folders here.')).toBeInTheDocument()
    expect(createCloudFolder).toHaveBeenCalledWith(
      'google',
      'token',
      CLOUD_ROOT_FOLDER,
      'Exports',
      expect.any(AbortSignal),
    )
    expect(screen.getByRole('textbox', { name: 'New Folder Name' })).toHaveValue('')
    await user.click(screen.getByRole('button', { name: 'Exports' }))
    await user.click(await screen.findByRole('button', { name: 'Use This Folder' }))
    expect(onDestination).toHaveBeenCalledWith({
      folder: { id: 'created', name: 'Exports' },
      providerAccountId: TOKEN.providerAccountId,
      generation: 2,
    })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('keeps a failed folder name for retry and suppresses a late creation after an account switch', async () => {
    const { user, onClose, onError } = setup()
    await screen.findByRole('button', { name: 'Projects' })
    vi.mocked(createCloudFolder).mockRejectedValueOnce(new Error('Folder already exists'))
    await user.type(screen.getByRole('textbox', { name: 'New Folder Name' }), 'Exports')
    await user.click(screen.getByRole('button', { name: 'Create Folder' }))
    expect(await screen.findByText('Folder already exists')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'New Folder Name' })).toHaveValue('Exports')
    const pending = Promise.withResolvers<typeof TOKEN>()
    vi.mocked(cloudTargetToken).mockReturnValueOnce(pending.promise)
    await user.click(screen.getByRole('button', { name: 'Create Folder' }))
    await act(async () => {
      setOfflineUser('other')
      window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT))
      pending.resolve(TOKEN)
      await pending.promise
    })
    expect(createCloudFolder).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
    expect(onError).not.toHaveBeenCalled()
  })

  it('hides its modal for native Google selection and restores it after cancel or error', async () => {
    const { user, onImport, onClose } = setup()
    const native = Promise.withResolvers<File[]>()
    vi.mocked(pickFromGoogleDrive).mockReturnValueOnce(native.promise)
    await user.click(await screen.findByRole('button', { name: 'Browse Drive' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await act(async () => {
      native.resolve([])
      await native.promise
    })
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(onImport).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    vi.mocked(pickFromGoogleDrive).mockRejectedValueOnce(new Error('Picker refused'))
    await user.click(screen.getByRole('button', { name: 'Browse Drive' }))
    expect(await screen.findByText('Picker refused')).toBeInTheDocument()
    vi.mocked(pickFromGoogleDrive).mockResolvedValueOnce([FILE])
    await user.click(screen.getByRole('button', { name: 'Browse Drive' }))
    expect(onImport).toHaveBeenCalledWith([FILE])
    expect(onClose).toHaveBeenCalledOnce()
    expect(pickGoogleDriveFolder).not.toHaveBeenCalled()
  })

  it('uses native Google folder authorization only for save destinations', async () => {
    const { user, onDestination } = setup('google', 'save')
    await user.click(await screen.findByRole('button', { name: 'Browse Drive' }))
    expect(onDestination).not.toHaveBeenCalled()
    const destination = {
      folder: { id: 'authorized-folder', name: 'Authorized' },
      providerAccountId: TOKEN.providerAccountId,
      generation: 2,
    }
    vi.mocked(pickGoogleDriveFolder).mockResolvedValueOnce(destination)
    await user.click(await screen.findByRole('button', { name: 'Browse Drive' }))
    expect(onDestination).toHaveBeenCalledWith(destination)
    expect(pickFromGoogleDrive).not.toHaveBeenCalled()
  })

  it('does not import a native selection returned for a different app account', async () => {
    const { user, onImport } = setup()
    const native = Promise.withResolvers<File[]>()
    vi.mocked(pickFromGoogleDrive).mockReturnValueOnce(native.promise)
    await user.click(await screen.findByRole('button', { name: 'Browse Drive' }))
    await act(async () => {
      setOfflineUser('other')
      window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT))
      native.resolve([FILE])
      await native.promise
    })
    expect(onImport).not.toHaveBeenCalled()
  })

  it('reports a provider connection failure and allows retry without claiming connected status', async () => {
    vi.mocked(cloudConnections).mockResolvedValue({
      connections: [connection('google', 'reconnect')],
    })
    vi.mocked(connectCloudProvider).mockRejectedValueOnce(new Error('Provider refused'))
    const { user, onError } = setup()
    await user.click(await screen.findByRole('button', { name: 'Connect Google Drive' }))
    expect(await screen.findByText('Provider refused')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect Google Drive' })).toBeEnabled()
    expect(listCloudFolder).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it('aborts a closing connection flow and reports unconfirmed server cancellation to the parent', async () => {
    const { pending, unmount, onError } = await startPendingConnection()
    const signal = vi.mocked(connectCloudProvider).mock.calls[0]?.[1]
    unmount()
    expect(signal?.aborted).toBe(true)
    await act(async () => {
      pending.reject(new Error('Cancellation could not be confirmed'))
      try {
        await pending.promise
      } catch {
        /* Expected provider rejection is also consumed by the component. */
      }
    })
    expect(onError).toHaveBeenCalledWith('Cancellation could not be confirmed')
  })

  it.each(['missing-provider', 'missing-account', 'unavailable', 'offline'] as const)(
    'fails closed for %s status instead of browsing another account',
    async (state) => {
      switch (state) {
        case 'missing-provider': {
          vi.mocked(cloudConnections).mockResolvedValue({ connections: [] })
          break
        }
        case 'missing-account': {
          vi.mocked(cloudConnections).mockResolvedValue({
            connections: [{ ...connection(), providerAccountId: null }],
          })
          break
        }
        case 'unavailable': {
          vi.mocked(cloudConnections).mockResolvedValue({
            connections: [{ ...connection('google', 'disconnected'), isConfigured: false }],
          })
          break
        }
        default: {
          vi.mocked(cloudConnections).mockRejectedValue(new Error('Network unavailable'))
        }
      }
      setup()
      if (state === 'unavailable')
        expect(await screen.findByRole('button', { name: 'Connect Google Drive' })).toBeDisabled()
      else expect(await screen.findByRole('alert')).toBeInTheDocument()
      expect(listCloudFolder).not.toHaveBeenCalled()
      expect(connectCloudProvider).not.toHaveBeenCalled()
    },
  )

  it('ignores a folder response after the browser closes', async () => {
    const listing = Promise.withResolvers<CloudBrowserItem[]>()
    vi.mocked(listCloudFolder).mockReturnValueOnce(listing.promise)
    const { unmount, onImport, onError } = setup()
    await waitFor(() => expect(listCloudFolder).toHaveBeenCalledOnce())
    unmount()
    await act(async () => {
      listing.resolve(ITEMS)
      await listing.promise
    })
    expect(onImport).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it('explains managed Microsoft consent before connecting and cancels the pending flow explicitly', async () => {
    vi.mocked(cloudConnections).mockResolvedValue({
      connections: [connection('onedrive', 'disconnected')],
    })
    const pending = Promise.withResolvers<undefined>()
    vi.mocked(connectCloudProvider).mockReturnValueOnce(pending.promise)
    const { user, onImport } = setup('onedrive')
    expect(
      await screen.findByText(
        'Work or school accounts may require approval from your Microsoft administrator.',
      ),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Connect OneDrive' }))
    const cancel = screen.getAllByRole('button', { name: 'Cancel' })[0]
    if (cancel === undefined) throw new Error('Pending flow must expose Cancel')
    await user.click(cancel)
    expect(vi.mocked(connectCloudProvider).mock.calls[0]?.[1]?.aborted).toBe(true)
    const failure = expect(pending.promise).rejects.toThrow('Connection cancelled')
    await act(async () => {
      pending.reject(new Error('Connection cancelled'))
      await failure
    })
    expect(await screen.findByText('Connection cancelled')).toBeInTheDocument()
    expect(onImport).not.toHaveBeenCalled()
  })

  it('does not restore cloud status or call completion after the browser is unmounted', async () => {
    const status = Promise.withResolvers<{ connections: CloudConnectionDto[] }>()
    vi.mocked(cloudConnections).mockReturnValueOnce(status.promise)
    const { unmount, onImport, onClose } = setup()
    unmount()
    await act(async () => {
      status.resolve({ connections: [connection()] })
      await status.promise
    })
    expect(listCloudFolder).not.toHaveBeenCalled()
    expect(onImport).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('ignores native picker errors after close rather than restoring a dismissed dialog', async () => {
    const native = Promise.withResolvers<File[]>()
    vi.mocked(pickFromGoogleDrive).mockReturnValueOnce(native.promise)
    const { user, unmount, onError, onImport } = setup()
    await user.click(await screen.findByRole('button', { name: 'Browse Drive' }))
    unmount()
    const failure = expect(native.promise).rejects.toThrow('LATE_PICKER_ERROR')
    await act(async () => {
      native.reject(new Error('LATE_PICKER_ERROR'))
      await failure
    })
    expect(onError).not.toHaveBeenCalled()
    expect(onImport).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not replace an editor file when its cloud download finishes after closing the browser', async () => {
    const pending = Promise.withResolvers<File>()
    vi.mocked(downloadCloudFile).mockReturnValueOnce(pending.promise)
    const { user, unmount, onImport, onClose } = setup()
    await user.click(await screen.findByRole('button', { name: 'clip.mp4' }))
    await user.click(screen.getByRole('button', { name: 'Open Selected' }))
    await waitFor(() => expect(downloadCloudFile).toHaveBeenCalledOnce())
    unmount()
    await act(async () => {
      pending.resolve(FILE)
      await pending.promise
    })
    expect(onImport).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not submit a save destination when its token returns after the browser closes', async () => {
    const { user, unmount, onDestination } = setup('google', 'save')
    await screen.findByRole('button', { name: 'Projects' })
    const pending = Promise.withResolvers<typeof TOKEN>()
    vi.mocked(cloudTargetToken).mockReturnValueOnce(pending.promise)
    await user.click(screen.getByRole('button', { name: 'Use This Folder' }))
    unmount()
    await act(async () => {
      pending.resolve(TOKEN)
      await pending.promise
    })
    expect(onDestination).not.toHaveBeenCalled()
  })

  it('does not reload folders for a connection that completes after its browser closes', async () => {
    const { pending, unmount, onError } = await startPendingConnection()
    unmount()
    await act(async () => {
      pending.resolve(undefined)
      await pending.promise
    })
    expect(cloudConnections).toHaveBeenCalledOnce()
    expect(listCloudFolder).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })
})
