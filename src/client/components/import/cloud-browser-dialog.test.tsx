import { act, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CloudBrowserDialog } from './cloud-browser-dialog'
import { ACCOUNT_CHANGED_EVENT } from '../../lib/offline-account'
import { setOfflineUser } from '../../lib/offline-context'
import { ALL_CLOUD_CONFIG } from '../../test-support/cloud-config'

const TOKEN = {
  accessToken: 'provider-token',
  expiresAt: '2030-01-01T00:00:00.000Z',
  providerAccountId: 'cloud-account',
  generation: 1,
}
const CONNECTION = {
  provider: 'onedrive',
  status: 'connected',
  isConfigured: true,
  accountLabel: 'Cloud Owner',
  providerAccountId: 'cloud-account',
  generation: 1,
  accessScope: 'drive',
}
const ROOT = 'https://graph.microsoft.com/v1.0/me/drive/root/children'
const NESTED = 'https://graph.microsoft.com/v1.0/me/drive/items/folder-one/children'
const DOCUMENT = {
  id: 'document-one',
  name: 'Notes.pdf',
  file: { mimeType: 'application/pdf' },
  '@microsoft.graph.downloadUrl': 'https://files.1drv.com/document',
}
const PHOTO = {
  id: 'photo-one',
  name: 'Photo.png',
  file: { mimeType: 'image/png' },
  '@microsoft.graph.downloadUrl': 'https://files.1drv.com/photo',
}

beforeEach(() => setOfflineUser('owner'))
afterEach(() => {
  vi.unstubAllGlobals()
  setOfflineUser(null)
})

function install() {
  const state = {
    failFolder: false,
    failDownload: false,
    heldDownload: null as Promise<Response> | null,
  }
  const fetch = vi.fn<typeof globalThis.fetch>((input) => {
    const url = input instanceof Request ? input.url : input.toString()
    if (url === '/api/me/cloud/connections')
      return Promise.resolve(Response.json({ connections: [CONNECTION] }))
    if (url === '/api/me/cloud/onedrive/token') return Promise.resolve(Response.json(TOKEN))
    if (url === ROOT)
      return Promise.resolve(
        Response.json({
          value: [{ id: 'folder-one', name: 'Projects', folder: {} }, PHOTO, DOCUMENT],
        }),
      )
    if (url === NESTED)
      return Promise.resolve(
        Response.json(state.failFolder ? { error: 'denied' } : { value: [DOCUMENT] }, {
          status: state.failFolder ? 403 : 200,
        }),
      )
    if (url.startsWith('https://files.1drv.com/'))
      return (
        state.heldDownload ??
        Promise.resolve(new Response('ORIGINAL BYTES', { status: state.failDownload ? 403 : 200 }))
      )
    throw new Error('Unexpected cloud browser request')
  })
  vi.stubGlobal('fetch', fetch)
  return { state, fetch }
}

describe('shared persistent cloud browser', () => {
  it('uses the existing connection, filters for documents, opens folders, and imports original bytes without another sign-in', async () => {
    const { fetch } = install()
    const onImport = vi.fn<(files: File[]) => void>()
    const onClose = vi.fn()
    render(
      <CloudBrowserDialog
        provider="onedrive"
        config={ALL_CLOUD_CONFIG}
        mode="open"
        mediaKinds={['document']}
        onImport={onImport}
        onClose={onClose}
        onError={vi.fn()}
      />,
    )
    await screen.findByRole('button', { name: 'Notes.pdf' })
    expect(screen.queryByRole('button', { name: 'Photo.png' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Projects' }))
    await waitFor(() => expect(fetch.mock.calls.some(([url]) => url === NESTED)).toBe(true))
    await userEvent.click(await screen.findByRole('button', { name: 'Notes.pdf' }))
    await userEvent.click(screen.getByRole('button', { name: 'Open Selected' }))
    await waitFor(() => expect(onImport).toHaveBeenCalledOnce())
    const files = onImport.mock.calls[0]?.[0]
    if (files === undefined) throw new Error('Expected imported files')
    expect(files.map((file) => file.name)).toEqual(['Notes.pdf'])
    expect(await files[0]?.text()).toBe('ORIGINAL BYTES')
    expect(files[0]?.type).toBe('application/pdf')
    expect(onClose).toHaveBeenCalledOnce()
    expect(
      fetch.mock.calls.some(([url]) => typeof url === 'string' && url.endsWith('/connect')),
    ).toBe(false)
  })

  it('returns an explicit account-bound folder destination and never imports from the save picker', async () => {
    install()
    const destination = vi.fn()
    render(
      <CloudBrowserDialog
        provider="onedrive"
        config={ALL_CLOUD_CONFIG}
        mode="save"
        onDestination={destination}
        onClose={vi.fn()}
        onError={vi.fn()}
      />,
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Projects' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Use This Folder' })).toBeEnabled(),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Use This Folder' }))
    await waitFor(() =>
      expect(destination).toHaveBeenCalledWith({
        folder: { id: 'folder-one', name: 'Projects', kind: 'folder' },
        providerAccountId: 'cloud-account',
        generation: 1,
      }),
    )
  })

  it('keeps the existing folder after navigation errors and does not partially import failed downloads', async () => {
    const { state } = install()
    const onImport = vi.fn<(files: File[]) => void>()
    render(
      <CloudBrowserDialog
        provider="onedrive"
        config={ALL_CLOUD_CONFIG}
        mode="open"
        onImport={onImport}
        onClose={vi.fn()}
        onError={vi.fn()}
      />,
    )
    await screen.findByRole('button', { name: 'Projects' })
    state.failFolder = true
    await userEvent.click(screen.getByRole('button', { name: 'Projects' }))
    await screen.findByRole('alert')
    expect(screen.getByRole('button', { name: 'Photo.png' })).toBeInTheDocument()
    state.failDownload = true
    await userEvent.click(screen.getByRole('button', { name: 'Photo.png' }))
    await userEvent.click(screen.getByRole('button', { name: 'Open Selected' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not download'))
    expect(onImport).not.toHaveBeenCalled()
  })

  it('clears visible account data and never imports a late download after an account transition', async () => {
    const { state } = install()
    const held = Promise.withResolvers<Response>()
    state.heldDownload = held.promise
    const onImport = vi.fn<(files: File[]) => void>()
    const close = vi.fn()
    render(
      <CloudBrowserDialog
        provider="onedrive"
        config={ALL_CLOUD_CONFIG}
        mode="open"
        onImport={onImport}
        onClose={close}
        onError={vi.fn()}
      />,
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Photo.png' }))
    await userEvent.click(screen.getByRole('button', { name: 'Open Selected' }))
    act(() => {
      setOfflineUser('other')
      window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT))
    })
    await waitFor(() => expect(close).toHaveBeenCalled())
    await act(async () => {
      held.resolve(new Response('OLD ACCOUNT BYTES'))
      await held.promise
    })
    expect(onImport).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Photo.png' })).not.toBeInTheDocument()
  })
})
