import { screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PHOTO_PAGE_SIZE } from '../../../shared/constants'
import { seedOwnerWorkspace, seedViewerWorkspace } from '../../test-support/fake-auth-client'
import { fakeAuth, installFakeAuth } from '../../test-support/fake-auth-module'
import { makePhoto } from '../../test-support/fake-gallery-api'
import { installLibraryApi, makeWatermark } from '../../test-support/fake-library-api'
import { renderApp } from '../../test-support/render-app'

vi.mock('../../lib/auth-client', () => import('../../test-support/fake-auth-module'))

const client = fakeAuth

function seedPhotos(count: number) {
  return Array.from({ length: count }, (_, index) =>
    makePhoto({
      id: `photo-${String(index)}`,
      name: `shot-${String(index).padStart(3, '0')}.jpg`,
      presetId: index % 2 === 0 ? 'wm-1' : 'wm-2',
      presetName: index % 2 === 0 ? 'Studio signature' : 'Corner logo',
      createdAt: new Date(Date.UTC(2026, 8, 1, 0, 0, index)).toISOString(),
    }),
  )
}

beforeEach(() => {
  installFakeAuth()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('gallery page', () => {
  it('shows usage, pages through photos, filters by preset and search, and opens a photo', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    installLibraryApi({
      watermarks: [makeWatermark(), makeWatermark({ id: 'wm-2', name: 'Corner logo' })],
      gallery: {
        photos: seedPhotos(PHOTO_PAGE_SIZE + 5),
        maxBytes: 2 * 1024 * 1024 * 1024,
        uploadFailsWith: null,
      },
    })
    renderApp('/app/gallery')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Gallery')
    expect(await screen.findByTestId('usage-summary')).toHaveTextContent(
      `${String(PHOTO_PAGE_SIZE + 5)} photos · `,
    )
    expect(screen.getByRole('progressbar', { name: 'Storage used' })).toBeInTheDocument()

    const grid = await screen.findByRole('list')
    expect(within(grid).getAllByRole('listitem')).toHaveLength(PHOTO_PAGE_SIZE)
    // Newest first.
    expect(within(grid).getAllByRole('listitem')[0]).toHaveTextContent('shot-064.jpg')
    await user.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() =>
      expect(within(grid).getAllByRole('listitem')).toHaveLength(PHOTO_PAGE_SIZE + 5),
    )
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Preset'), 'wm-2')
    await waitFor(() =>
      expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(32),
    )
    await user.type(screen.getByLabelText('Search'), 'shot-00')
    await waitFor(() =>
      expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(5),
    )
    await user.selectOptions(screen.getByLabelText('Preset'), '')
    await waitFor(() =>
      expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(10),
    )

    await user.click(screen.getByRole('button', { name: 'Open shot-003.jpg' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'shot-003.jpg' })).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: /Download/ })).toHaveAttribute(
      'href',
      '/api/orgs/org-1/photos/photo-3/file',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('selects photos and deletes them after confirmation, and deletes from the lightbox', async () => {
    const user = userEvent.setup()
    seedOwnerWorkspace(client())
    const api = installLibraryApi({
      watermarks: [makeWatermark()],
      gallery: { photos: seedPhotos(3), maxBytes: 1024, uploadFailsWith: null },
    })
    renderApp('/app/gallery')
    await screen.findByRole('list')
    await user.click(screen.getByRole('checkbox', { name: 'Select shot-000.jpg' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select shot-001.jpg' }))
    await user.click(screen.getByRole('button', { name: 'Delete 2' }))
    const confirm = await screen.findByRole('alertdialog')
    expect(confirm).toHaveTextContent('Delete 2 photos?')
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(api.gallery.photos.map((photo) => photo.id)).toEqual(['photo-2']))
    await waitFor(() => expect(screen.getByTestId('usage-summary')).toHaveTextContent('1 photo ·'))

    await user.click(screen.getByRole('button', { name: 'Select all' }))
    expect(screen.getByRole('button', { name: 'Clear selection' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear selection' }))

    await user.click(screen.getByRole('button', { name: 'Open shot-002.jpg' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(api.gallery.photos).toEqual([]))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText(/No photos yet/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open the editor' })).toBeInTheDocument()
  })

  it('hides deletion from viewers and explains an empty filter', async () => {
    const user = userEvent.setup()
    seedViewerWorkspace(client())
    installLibraryApi({
      watermarks: [makeWatermark()],
      gallery: { photos: seedPhotos(2), maxBytes: 1024, uploadFailsWith: null },
    })
    renderApp('/app/gallery')
    await screen.findByRole('list')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open shot-001.jpg' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.type(screen.getByLabelText('Search'), 'nothing here')
    expect(await screen.findByText('No photos match these filters.')).toBeInTheDocument()
  })

  it('reports a failed load', async () => {
    seedOwnerWorkspace(client())
    installLibraryApi({ failWith: 'forbidden' })
    renderApp('/app/gallery')
    expect(await screen.findByRole('alert')).toHaveTextContent('Your role does not allow this.')
  })
})
