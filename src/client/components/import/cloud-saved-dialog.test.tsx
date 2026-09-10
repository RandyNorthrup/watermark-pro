import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CloudSavedDialog } from './cloud-saved-dialog'
import { createCloudShare, revokeCloudShare } from '../../lib/imports/cloud-sharing'
import type { CloudSavedFile } from '../../lib/imports/cloud-transfer'
import { setOfflineUser } from '../../lib/offline-context'
import { ALL_CLOUD_CONFIG } from '../../test-support/cloud-config'

vi.mock('../../lib/imports/cloud-sharing', () => ({
  createCloudShare: vi.fn(),
  revokeCloudShare: vi.fn(),
}))
const FILE: CloudSavedFile = {
  provider: 'google',
  id: 'one',
  name: 'photo.png',
  userId: 'owner',
  manageUrl: 'https://drive.google.com/file/d/one/view',
}
const LINK = { url: FILE.manageUrl, permissionId: 'permission' }
beforeEach(() => {
  setOfflineUser('owner')
  vi.clearAllMocks()
})

describe('native sharing controls', () => {
  it('keeps saving private until an explicit link action, then allows copy and revoke', async () => {
    const user = userEvent.setup()
    vi.mocked(createCloudShare).mockResolvedValue(LINK)
    vi.mocked(revokeCloudShare).mockResolvedValue()
    render(<CloudSavedDialog config={ALL_CLOUD_CONFIG} files={[FILE]} />)
    await user.click(screen.getByRole('button', { name: 'Saved cloud files (1)' }))
    expect(createCloudShare).not.toHaveBeenCalled()
    expect(screen.getByText(/Saving does not create a public link/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open in Google Drive' })).toHaveAttribute(
      'href',
      FILE.manageUrl,
    )
    await user.click(screen.getByRole('button', { name: 'Create public link' }))
    await screen.findByRole('button', { name: 'Revoke public link' })
    expect(createCloudShare).toHaveBeenCalledWith(ALL_CLOUD_CONFIG, FILE)
    await user.click(screen.getByRole('button', { name: 'Copy link' }))
    await screen.findByRole('button', { name: 'Link copied' })
    expect(await navigator.clipboard.readText()).toBe(FILE.manageUrl)
    await user.click(screen.getByRole('button', { name: 'Revoke public link' }))
    await screen.findByRole('button', { name: 'Create public link' })
    expect(revokeCloudShare).toHaveBeenCalledWith(ALL_CLOUD_CONFIG, FILE, LINK)
    expect(screen.queryByRole('button', { name: 'Copy link' })).not.toBeInTheDocument()
  })

  it('leaves provider management available when sharing is forbidden', async () => {
    const user = userEvent.setup()
    vi.mocked(createCloudShare).mockRejectedValue(new Error('Organization forbids public links'))
    render(<CloudSavedDialog config={ALL_CLOUD_CONFIG} files={[FILE]} />)
    await user.click(screen.getByRole('button', { name: 'Saved cloud files (1)' }))
    await user.click(screen.getByRole('button', { name: 'Create public link' }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Organization forbids public links'),
    )
    expect(screen.getByRole('link', { name: 'Open in Google Drive' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copy link' })).not.toBeInTheDocument()
  })
})
