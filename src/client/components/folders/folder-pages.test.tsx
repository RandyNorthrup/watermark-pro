import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import type { FolderDto, FolderKind } from '../../../shared/folders'
import { seedOwnerWorkspace } from '../../test-support/fake-auth-client'
import { fakeAuth, installFakeAuth } from '../../test-support/fake-auth-module'
import { makePhoto } from '../../test-support/fake-gallery-api'
import { installLibraryApi, makeWatermark } from '../../test-support/fake-library-api'
import { mockElementBounds } from '../../test-support/mock-element-bounds'
import { renderApp } from '../../test-support/render-app'

vi.mock('../../lib/auth-client', () => import('../../test-support/fake-auth-module'))
vi.mock('../../lib/preview', () => import('../../test-support/fake-preview'))

beforeEach(() => {
  installFakeAuth()
  seedOwnerWorkspace(fakeAuth())
  mockElementBounds()
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:folder-test'), revokeObjectURL: vi.fn() })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function folder(
  name: string,
  kind: FolderKind = 'preset',
  parentId: string | null = null,
): FolderDto {
  return {
    id: crypto.randomUUID(),
    organizationId: 'org-1',
    name,
    kind,
    parentId,
    revision: 0,
    versionId: crypto.randomUUID(),
    childCount: 0,
    itemCount: 0,
    createdBy: 'user-1',
    createdAt: '2026-09-12T00:00:00.000Z',
    updatedAt: '2026-09-12T00:00:00.000Z',
  }
}

it('creates nested folders, renames in place, excludes descendant move destinations and deletes only empty folders', async () => {
  const state = installLibraryApi()
  const user = userEvent.setup()
  const { router } = renderApp('/app/library')
  await user.click(await screen.findByRole('button', { name: 'New Folder' }))
  let dialog = screen.getByRole('dialog', { name: 'New Folder' })
  await user.type(within(dialog).getByRole('textbox', { name: 'Folder Name' }), 'Clients')
  await user.click(within(dialog).getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(state.folders).toHaveLength(1))
  const parent = state.folders[0]
  if (parent === undefined) throw new Error('Expected parent folder')
  await waitFor(() => expect(router.state.location.search).toMatchObject({ folderId: parent.id }))
  await user.click(screen.getByRole('button', { name: 'New Folder' }))
  dialog = screen.getByRole('dialog', { name: 'New Folder' })
  await user.type(within(dialog).getByRole('textbox', { name: 'Folder Name' }), 'Drafts')
  await user.click(within(dialog).getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(state.folders).toHaveLength(2))
  expect(state.folders[1]?.parentId).toBe(parent.id)
  await user.click(await screen.findByRole('button', { name: 'Rename Folder' }))
  dialog = screen.getByRole('dialog', { name: 'Rename Folder' })
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Folder Name' }), {
    target: { value: 'Finals' },
  })
  await user.click(within(dialog).getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(state.folders[1]?.name).toBe('Finals'))
  await user.click(
    within(screen.getByRole('navigation', { name: 'Folder Path' })).getByRole('button', {
      name: 'Clients',
    }),
  )
  expect(await screen.findByRole('button', { name: 'Delete Folder' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Move Folder' }))
  dialog = screen.getByRole('dialog', { name: 'Move Folder' })
  await user.click(within(dialog).getByRole('button', { name: 'Destination Folder' }))
  expect(within(dialog).getByRole('button', { name: 'Clients' })).toBeDisabled()
  await user.click(within(dialog).getByRole('button', { name: 'Expand Clients' }))
  expect(within(dialog).getByRole('button', { name: 'Finals' })).toBeDisabled()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Open Finals' }))
  await user.click(screen.getByRole('button', { name: 'Delete Folder' }))
  await user.click(
    within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete Folder' }),
  )
  await waitFor(() => expect(state.folders).toHaveLength(1))
  expect(state.folders[0]?.id).toBe(parent.id)
})

it('moves a Library preset through the actual modal and keeps new saves in the current folder', async () => {
  const state = installLibraryApi()
  const target = folder('Deliveries')
  state.folders.push(target)
  state.watermarks.push(makeWatermark({ name: 'Signature' }))
  const user = userEvent.setup()
  const { router } = renderApp('/app/library')
  await user.click(await screen.findByRole('button', { name: 'Move Signature' }))
  const dialog = screen.getByRole('dialog', { name: 'Move Items' })
  await user.click(within(dialog).getByRole('button', { name: 'Destination Folder' }))
  await user.click(within(dialog).getByRole('button', { name: 'Deliveries' }))
  await user.click(within(dialog).getByRole('button', { name: 'Move Here' }))
  await waitFor(() => expect(state.watermarks[0]?.folderId).toBe(target.id))
  await waitFor(() =>
    expect(screen.queryByRole('link', { name: 'Signature' })).not.toBeInTheDocument(),
  )
  await user.click(screen.getByRole('button', { name: 'Open Deliveries' }))
  expect(await screen.findByRole('link', { name: 'Signature' })).toBeVisible()
  await user.click(screen.getByRole('link', { name: /^New Watermark$/i }))
  await waitFor(() => expect(router.state.location.search).toMatchObject({ folderId: target.id }))
  const name = await screen.findByRole('textbox', { name: /Watermark Name/i })
  await user.type(name, 'Filed New Preset')
  await user.click(screen.getByRole('button', { name: /^Save Watermark$/i }))
  await waitFor(() =>
    expect(
      state.watermarks.some(
        (preset) => preset.name === 'Filed New Preset' && preset.folderId === target.id,
      ),
    ).toBe(true),
  )
})

it('lets viewers browse Gallery folders but never exposes folder or content mutations', async () => {
  const state = installLibraryApi()
  const target = folder('Shared Deliveries', 'photo')
  state.folders.push(target)
  state.gallery.photos.push(makePhoto({ name: 'Client Photo', folderId: target.id }))
  const organization = fakeAuth().state.organizations[0]
  const viewer = organization?.members.find((member) => member.role === 'viewer')
  if (viewer === undefined) throw new Error('Expected viewer fixture')
  fakeAuth().state.user = { ...viewer.user, image: null, emailVerified: true }
  const user = userEvent.setup()
  renderApp('/app/gallery')
  await user.click(await screen.findByRole('button', { name: 'Open Shared Deliveries' }))
  expect(await screen.findByRole('button', { name: /Open Client Photo/ })).toBeVisible()
  expect(screen.queryByRole('button', { name: 'New Folder' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Rename Folder' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Delete Folder' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Move Items' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: /^Check A Photo$/i })).toHaveClass('w-full', 'sm:w-auto')
})
