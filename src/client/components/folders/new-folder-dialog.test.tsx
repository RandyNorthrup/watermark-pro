import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { NewFolderDialog } from './new-folder-dialog'
import { setOfflineUser } from '../../lib/offline-context'
import { createQueryClient } from '../../lib/query-client'
import { seedOwnerWorkspace } from '../../test-support/fake-auth-client'
import { fakeAuth, installFakeAuth } from '../../test-support/fake-auth-module'
import { installLibraryApi } from '../../test-support/fake-library-api'

vi.mock('../../lib/auth-client', () => import('../../test-support/fake-auth-module'))
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('keeps creation pending until the selected folder navigation has committed', async () => {
  installFakeAuth()
  seedOwnerWorkspace(fakeAuth())
  installLibraryApi()
  const owner = fakeAuth().state.user
  if (owner === null) throw new Error('Expected signed-in fixture')
  setOfflineUser(owner.id)
  const navigation = Promise.withResolvers<undefined>()
  const onCreated = vi.fn(() => navigation.promise)
  render(
    <QueryClientProvider client={createQueryClient()}>
      <NewFolderDialog organizationId="org-1" kind="preset" parentId={null} onCreated={onCreated} />
    </QueryClientProvider>,
  )
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'New Folder' }))
  const dialog = screen.getByRole('dialog')
  await user.type(within(dialog).getByRole('textbox', { name: 'Folder Name' }), 'Client Deliveries')
  const save = within(dialog).getByRole('button', { name: 'Save' })
  await user.click(save)
  await waitFor(() => expect(onCreated).toHaveBeenCalledOnce())
  expect(dialog).toBeVisible()
  expect(save).toBeDisabled()
  await act(async () => {
    navigation.resolve(undefined)
    await navigation.promise
  })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})
