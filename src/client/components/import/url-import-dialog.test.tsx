import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { UrlImportDialog } from './url-import-dialog'
import { ApiRequestError } from '../../lib/api'
import { importFromUrl } from '../../lib/imports/url'

vi.mock('../../lib/imports/url', () => ({ importFromUrl: vi.fn() }))
const importMock = vi.mocked(importFromUrl)

afterEach(() => {
  importMock.mockReset()
})

function renderDialog(onImport = vi.fn()) {
  render(
    <UrlImportDialog
      organizationId="org-1"
      onImport={onImport}
      trigger={<button type="button">Import from a link</button>}
    />,
  )
  return { user: userEvent.setup(), onImport }
}

const IMAGE_URL = 'https://cdn.example.com/photo.jpg'

describe('UrlImportDialog', () => {
  it('fetches the link, hands the file back, and closes on success', async () => {
    const file = new File([new Uint8Array([1])], 'photo.jpg', { type: 'image/jpeg' })
    importMock.mockResolvedValue(file)
    const { user, onImport } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Import from a link' }))
    await user.type(screen.getByLabelText('Image link'), IMAGE_URL)
    await user.click(screen.getByRole('button', { name: 'Fetch' }))

    await waitFor(() => expect(onImport).toHaveBeenCalledWith(file))
    expect(importMock).toHaveBeenCalledWith('org-1', IMAGE_URL)
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Import from a link' })).not.toBeInTheDocument(),
    )
  })

  it('shows the error message and stays open on failure', async () => {
    importMock.mockRejectedValue(
      new ApiRequestError('/api/orgs/org-1/imports/url', 415, 'That file type is not supported.'),
    )
    const { user, onImport } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Import from a link' }))
    await user.type(screen.getByLabelText('Image link'), IMAGE_URL)
    await user.click(screen.getByRole('button', { name: 'Fetch' }))

    expect(await screen.findByText('That file type is not supported.')).toBeInTheDocument()
    expect(onImport).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Import from a link' })).toBeInTheDocument()
  })

  it('disables Fetch until a link is entered', async () => {
    const { user } = renderDialog()
    await user.click(screen.getByRole('button', { name: 'Import from a link' }))

    expect(screen.getByRole('button', { name: 'Fetch' })).toBeDisabled()
    await user.type(screen.getByLabelText('Image link'), IMAGE_URL)
    expect(screen.getByRole('button', { name: 'Fetch' })).toBeEnabled()
  })

  it('closes without importing when Cancel is used', async () => {
    const { user, onImport } = renderDialog()
    await user.click(screen.getByRole('button', { name: 'Import from a link' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Import from a link' })).not.toBeInTheDocument(),
    )
    expect(onImport).not.toHaveBeenCalled()
    expect(importMock).not.toHaveBeenCalled()
  })
})
