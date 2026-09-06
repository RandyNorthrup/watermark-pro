import { screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { seedOwnerWorkspace, seedViewerWorkspace } from '../test-support/fake-auth-client'
import { fakeAuth, installFakeAuth } from '../test-support/fake-auth-module'
import { makePhoto } from '../test-support/fake-gallery-api'
import { installLibraryApi, makeWatermark } from '../test-support/fake-library-api'
import { fakeShareToken, makeShare } from '../test-support/fake-share-api'
import { renderApp } from '../test-support/render-app'

vi.mock('../lib/auth-client', () => import('../test-support/fake-auth-module'))

const client = fakeAuth
const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve())

/** user-event installs its own clipboard stub on setup; ours must be applied afterwards. */
function setupUser() {
  const user = userEvent.setup()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  return user
}

function photos() {
  return [
    makePhoto({ id: 'photo-1', name: 'one.jpg' }),
    makePhoto({ id: 'photo-2', name: 'two.jpg', createdAt: '2026-09-04T10:00:00.000Z' }),
  ]
}

/** An owner's gallery with two photos, rendered and ready. */
async function openOwnerGallery() {
  seedOwnerWorkspace(client())
  const api = installLibraryApi({
    watermarks: [makeWatermark()],
    gallery: { photos: photos(), maxBytes: 1024, uploadFailsWith: null },
  })
  renderApp('/app/gallery')
  await screen.findByRole('list')
  return api
}

beforeEach(() => {
  installFakeAuth()
  writeText.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('sharing from the gallery', () => {
  it('creates a link for selected photos and copies it', async () => {
    const user = setupUser()
    const api = await openOwnerGallery()
    expect(screen.getByRole('button', { name: /^Share/ })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: 'Select one.jpg' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select two.jpg' }))
    await user.click(screen.getByRole('button', { name: 'Share 2' }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Share 2 photos')
    await user.clear(within(dialog).getByLabelText('Title'))
    await user.type(within(dialog).getByLabelText('Title'), 'Spring shoot')
    await user.click(within(dialog).getByRole('radio', { name: '30 days' }))
    await user.click(within(dialog).getByRole('button', { name: 'Create link' }))

    const link = await within(dialog).findByLabelText('Link')
    expect((link as HTMLInputElement).value).toContain('/share/fake.share-')
    expect(api.shares.shares[0]).toMatchObject({ title: 'Spring shoot', photoCount: 2 })
    expect(api.shares.shares[0]?.expiresAt).not.toBeNull()
    expect(dialog).toHaveTextContent(/Expires /)

    await user.click(within(dialog).getByRole('button', { name: 'Copy link' }))
    expect(await within(dialog).findByText('Link copied to the clipboard.')).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledWith(api.shares.shares[0]?.url)

    // No share sheet in jsdom, so "Share…" also copies.
    await user.click(within(dialog).getByRole('button', { name: 'Share…' }))
    expect(writeText).toHaveBeenCalledTimes(2)
  })

  it('shares a single photo from the lightbox with a never-expiring link', async () => {
    const user = setupUser()
    const api = await openOwnerGallery()
    await user.click(screen.getByRole('button', { name: 'Open one.jpg' }))
    const lightbox = await screen.findByRole('dialog')
    await user.click(within(lightbox).getByRole('button', { name: 'Share' }))
    const dialogs = await screen.findAllByRole('dialog')
    const shareDialog = dialogs.at(-1)
    expect(shareDialog).toBeDefined()
    if (shareDialog === undefined) {
      return
    }
    expect(within(shareDialog).getByLabelText('Title')).toHaveValue('one.jpg')
    await user.click(within(shareDialog).getByRole('radio', { name: 'Never' }))
    await user.click(within(shareDialog).getByRole('button', { name: 'Create link' }))
    expect(await screen.findByText(/This link does not expire/)).toBeInTheDocument()
    expect(api.shares.shares[0]).toMatchObject({ title: 'one.jpg', photoCount: 1, expiresAt: null })
  })

  it('hides sharing from viewers', async () => {
    seedViewerWorkspace(client())
    installLibraryApi({
      watermarks: [makeWatermark()],
      gallery: { photos: photos(), maxBytes: 1024, uploadFailsWith: null },
    })
    renderApp('/app/gallery')
    await screen.findByRole('list')
    expect(screen.queryByRole('button', { name: /^Share/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
})

describe('shares page', () => {
  it('lists links with their status, copies and revokes them', async () => {
    const user = setupUser()
    seedOwnerWorkspace(client())
    const api = installLibraryApi({
      watermarks: [makeWatermark()],
      shares: {
        shares: [
          makeShare({ id: 'live', title: 'Live link' }),
          makeShare({ id: 'old', title: 'Old link', expiresAt: '2020-01-01T00:00:00.000Z' }),
          makeShare({ id: 'gone', title: 'Gone link', revokedAt: '2026-09-01T00:00:00.000Z' }),
        ],
      },
    })
    renderApp('/app/shares')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Shares')
    const rows = await screen.findAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('active')
    expect(rows[1]).toHaveTextContent('expired')
    expect(rows[2]).toHaveTextContent('revoked')
    expect(screen.getAllByRole('button', { name: /^Revoke/ })).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Copy link' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Link copied to the clipboard.')
    expect(writeText).toHaveBeenCalledWith(api.shares.shares[0]?.url)

    await user.click(screen.getByRole('button', { name: 'Revoke Live link' }))
    await waitFor(() => expect(api.shares.shares[0]?.revokedAt).not.toBeNull())
    await waitFor(() => expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('revoked'))
    expect(screen.queryByRole('button', { name: /^Revoke/ })).not.toBeInTheDocument()
  })

  it('shows an empty state and blocks viewers', async () => {
    seedOwnerWorkspace(client())
    const { unmount } = renderApp('/app/shares')
    installLibraryApi({ watermarks: [makeWatermark()] })
    expect(await screen.findByText(/No links yet/)).toBeInTheDocument()
    unmount()

    seedViewerWorkspace(client())
    renderApp('/app/shares')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your role does not include sharing.',
    )
  })
})

describe('public share page', () => {
  it('shows the album to a visitor, opens a photo, and offers the link', async () => {
    const user = setupUser()
    installLibraryApi({
      gallery: { photos: photos(), maxBytes: 1024, uploadFailsWith: null },
      shares: {
        shares: [
          makeShare({ id: 'live', title: 'Spring shoot', expiresAt: '2030-01-01T00:00:00.000Z' }),
        ],
      },
    })
    renderApp(`/share/${fakeShareToken('live')}`)
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Spring shoot')
    expect(screen.getByText(/2 photos · available until/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open two.jpg' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('link', { name: /Download/ })).toHaveAttribute(
      'href',
      `/api/share/${fakeShareToken('live')}/photos/photo-2/file`,
    )
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Share this link' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Link copied to the clipboard.')
    expect(writeText).toHaveBeenCalledWith(location.href)
  })

  it('explains an unavailable link without revealing why', async () => {
    installLibraryApi({
      shares: { shares: [makeShare({ id: 'gone', revokedAt: '2026-09-01T00:00:00.000Z' })] },
    })
    renderApp(`/share/${fakeShareToken('gone')}`)
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      'This link is not available',
    )
    expect(screen.getByText(/expired or been revoked/)).toBeInTheDocument()
  })
})
