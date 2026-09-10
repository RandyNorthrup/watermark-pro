import { act, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { OneDriveDialog } from './onedrive-dialog'
import {
  acquireGraphToken,
  downloadOneDriveImage,
  listOneDriveImages,
  type OneDriveImage,
  type OneDriveItem,
} from '../../lib/imports/onedrive'
import { ACCOUNT_CHANGED_EVENT } from '../../lib/offline-account'
import { setOfflineUser } from '../../lib/offline-context'
import { ALL_CLOUD_CONFIG } from '../../test-support/cloud-config'

vi.mock('../../lib/imports/onedrive', () => ({
  acquireGraphToken: vi.fn(),
  listOneDriveImages: vi.fn(),
  downloadOneDriveImage: vi.fn(),
}))

const PHOTO: OneDriveImage = {
  kind: 'image',
  id: 'photo',
  name: 'coast.png',
  mimeType: 'image/png',
  downloadUrl: 'https://files.1drv.com/coast',
}
const SECOND_PHOTO: OneDriveImage = { ...PHOTO, id: 'second', name: 'mountain.png' }
const ROOT: OneDriveItem[] = [{ kind: 'folder', id: 'travel', name: 'Travel' }, PHOTO]
const DOWNLOADED = new File(['selected image'], PHOTO.name, { type: PHOTO.mimeType })

beforeEach(() => {
  vi.resetAllMocks()
  setOfflineUser('owner')
  vi.mocked(acquireGraphToken).mockResolvedValue('graph-token')
  vi.mocked(listOneDriveImages).mockResolvedValue(ROOT)
  vi.mocked(downloadOneDriveImage).mockResolvedValue(DOWNLOADED)
})

async function open() {
  const onImport = vi.fn()
  const user = userEvent.setup()
  render(
    <OneDriveDialog
      config={ALL_CLOUD_CONFIG}
      onImport={onImport}
      trigger={<button type="button">Browse cloud photos</button>}
    />,
  )
  await user.click(screen.getByRole('button', { name: 'Browse cloud photos' }))
  return { user, onImport }
}

describe('OneDrive browser dialog', () => {
  it('offers no trigger when the deployment has no Microsoft client', () => {
    render(
      <OneDriveDialog
        config={{ ...ALL_CLOUD_CONFIG, microsoftClientId: null }}
        onImport={vi.fn()}
        trigger={<button type="button">Browse cloud photos</button>}
      />,
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(acquireGraphToken).not.toHaveBeenCalled()
  })

  it('navigates folders and breadcrumbs while resetting selections', async () => {
    vi.mocked(listOneDriveImages)
      .mockResolvedValueOnce(ROOT)
      .mockResolvedValueOnce([{ kind: 'folder', id: 'year', name: '2026' }, SECOND_PHOTO])
      .mockResolvedValueOnce([PHOTO])
      .mockResolvedValueOnce([SECOND_PHOTO])
      .mockResolvedValueOnce(ROOT)
    const { user, onImport } = await open()
    await user.click(await screen.findByRole('checkbox', { name: PHOTO.name }))
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Travel' }))
    await user.click(await screen.findByRole('button', { name: '2026' }))
    await screen.findByRole('checkbox', { name: PHOTO.name })
    const breadcrumb = screen.getByRole('navigation', { name: 'Folder path' })
    expect(within(breadcrumb).getByRole('button', { name: '2026' })).toHaveAttribute(
      'aria-current',
      'location',
    )
    expect(screen.getByText('No photos selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add selected' })).toBeDisabled()
    await user.click(within(breadcrumb).getByRole('button', { name: 'Travel' }))
    await screen.findByRole('checkbox', { name: SECOND_PHOTO.name })
    await user.click(within(breadcrumb).getByRole('button', { name: 'OneDrive' }))
    await screen.findByRole('button', { name: 'Travel' })
    expect(vi.mocked(listOneDriveImages).mock.calls).toEqual([
      ['graph-token'],
      ['graph-token', 'travel'],
      ['graph-token', 'year'],
      ['graph-token', 'travel'],
      ['graph-token', undefined],
    ])
    expect(downloadOneDriveImage).not.toHaveBeenCalled()
    expect(onImport).not.toHaveBeenCalled()
  })

  it('downloads only selected photos and resets the selection when reopened', async () => {
    vi.mocked(listOneDriveImages).mockResolvedValue([PHOTO, SECOND_PHOTO])
    const { user, onImport } = await open()
    const selected = await screen.findByRole('checkbox', { name: PHOTO.name })
    await user.click(selected)
    await user.click(selected)
    expect(screen.getByRole('button', { name: 'Add selected' })).toBeDisabled()
    await user.click(selected)
    await user.click(screen.getByRole('button', { name: 'Add selected' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(downloadOneDriveImage).toHaveBeenCalledExactlyOnceWith(PHOTO)
    expect(onImport).toHaveBeenCalledExactlyOnceWith([DOWNLOADED])
    await user.click(screen.getByRole('button', { name: 'Browse cloud photos' }))
    expect(await screen.findByRole('checkbox', { name: PHOTO.name })).not.toBeChecked()
    expect(acquireGraphToken).toHaveBeenCalledTimes(2)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onImport).toHaveBeenCalledOnce()
  })

  it('shows sign-in failures and retries into an empty folder without importing', async () => {
    vi.mocked(acquireGraphToken).mockRejectedValueOnce(new Error('Microsoft sign-in denied'))
    vi.mocked(listOneDriveImages).mockResolvedValue([])
    const { user, onImport } = await open()
    expect(await screen.findByRole('alert')).toHaveTextContent('Microsoft sign-in denied')
    expect(listOneDriveImages).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(screen.getByText('No folders or images here.')).toBeInTheDocument()
    expect(acquireGraphToken).toHaveBeenLastCalledWith(ALL_CLOUD_CONFIG.microsoftClientId)
    expect(onImport).not.toHaveBeenCalled()
  })

  it('keeps the current folder visible after a navigation failure', async () => {
    vi.mocked(listOneDriveImages)
      .mockResolvedValueOnce(ROOT)
      .mockRejectedValueOnce(new Error('Folder unavailable'))
    const { user, onImport } = await open()
    await user.click(await screen.findByRole('button', { name: 'Travel' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Folder unavailable')
    expect(screen.getByRole('checkbox', { name: PHOTO.name })).toBeInTheDocument()
    expect(onImport).not.toHaveBeenCalled()
  })

  it('shows download failures without closing or partially importing', async () => {
    vi.mocked(downloadOneDriveImage).mockRejectedValueOnce(new Error('Download expired'))
    const { user, onImport } = await open()
    await user.click(await screen.findByRole('checkbox', { name: PHOTO.name }))
    await user.click(screen.getByRole('button', { name: 'Add selected' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Download expired')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add selected' })).toBeEnabled()
    expect(onImport).not.toHaveBeenCalled()
  })

  it('discards a sign-in response from the previous app account', async () => {
    const pending = Promise.withResolvers<string>()
    vi.mocked(acquireGraphToken).mockReturnValueOnce(pending.promise)
    const { onImport } = await open()
    expect(screen.getByRole('status', { name: 'Loading OneDrive' })).toBeInTheDocument()
    await act(async () => {
      setOfflineUser('other')
      window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT))
      pending.resolve('old-account-token')
      await pending.promise
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(listOneDriveImages).not.toHaveBeenCalled()
    expect(onImport).not.toHaveBeenCalled()
  })

  it('discards an old account folder response and requires a fresh connection', async () => {
    const pending = Promise.withResolvers<OneDriveItem[]>()
    vi.mocked(listOneDriveImages).mockResolvedValueOnce(ROOT).mockReturnValueOnce(pending.promise)
    const { user, onImport } = await open()
    await user.click(await screen.findByRole('button', { name: 'Travel' }))
    await act(async () => {
      setOfflineUser('other')
      window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT))
      pending.resolve([SECOND_PHOTO])
      await pending.promise
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Browse cloud photos' }))
    await screen.findByRole('checkbox', { name: PHOTO.name })
    expect(screen.queryByRole('checkbox', { name: SECOND_PHOTO.name })).not.toBeInTheDocument()
    expect(acquireGraphToken).toHaveBeenCalledTimes(2)
    expect(onImport).not.toHaveBeenCalled()
  })

  it('never imports a download completed after the app account changes', async () => {
    const pending = Promise.withResolvers<File>()
    vi.mocked(downloadOneDriveImage).mockReturnValueOnce(pending.promise)
    const { user, onImport } = await open()
    await user.click(await screen.findByRole('checkbox', { name: PHOTO.name }))
    await user.click(screen.getByRole('button', { name: 'Add selected' }))
    expect(screen.getByRole('checkbox', { name: PHOTO.name })).toBeDisabled()
    await act(async () => {
      setOfflineUser('other')
      window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT))
      pending.resolve(DOWNLOADED)
      await pending.promise
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onImport).not.toHaveBeenCalled()
  })
})
