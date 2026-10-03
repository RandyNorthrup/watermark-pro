import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AccountRemovalCard } from './account-removal-card'
import { setOfflineUser } from '../lib/offline-context'
import { offlineStatus, updateOfflineStatus } from '../lib/offline-status'

interface DeleteResult {
  data: { success: boolean; message: string } | null
  error: { message: string; status: number; code?: string } | null
}
const fixture = vi.hoisted(() => ({
  deleteUser: vi.fn<() => Promise<DeleteResult>>(),
  cleanup: vi.fn<() => Promise<boolean>>(),
  removed: vi.fn<() => Promise<void>>(),
}))
vi.mock('../lib/auth-client', () => ({ authClient: { deleteUser: fixture.deleteUser } }))
vi.mock('../lib/offline-account', () => ({ didEraseRemovedAccountData: fixture.cleanup }))

const USER_ID = 'removal-fixture-owner'
const EMAIL = 'removal-fixture@example.com'
const DELETED: DeleteResult = { data: { success: true, message: 'User deleted' }, error: null }

beforeEach(() => {
  fixture.deleteUser.mockReset().mockResolvedValue(DELETED)
  fixture.cleanup.mockReset().mockResolvedValue(true)
  fixture.removed.mockReset().mockResolvedValue(undefined)
  setOfflineUser(USER_ID)
  updateOfflineStatus({ accountCleanup: null })
})
afterEach(() => {
  setOfflineUser(null)
  updateOfflineStatus({ accountCleanup: null })
})

function mount(isProtectedOwner = false) {
  const client = new QueryClient()
  render(
    <QueryClientProvider client={client}>
      <AccountRemovalCard
        userId={USER_ID}
        email={EMAIL}
        isProtectedOwner={isProtectedOwner}
        onRemoved={fixture.removed}
      />
    </QueryClientProvider>,
  )
  return client
}

async function confirm() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Delete account' }))
  const dialog = screen.getByRole('alertdialog')
  await user.type(within(dialog).getByLabelText('Confirm your email'), EMAIL)
  return {
    user,
    dialog,
    button: within(dialog).getByRole('button', { name: 'Delete permanently' }),
  }
}

describe('explicit account removal', () => {
  it('protects the site owner without offering a destructive action', () => {
    mount(true)
    expect(screen.getByText('The site owner account is protected.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
    expect(fixture.deleteUser).not.toHaveBeenCalled()
  })

  it('requires exact confirmation and explains actual retained/deferred data', async () => {
    mount()
    const { user, dialog, button } = await confirm()
    expect(dialog).toHaveTextContent('files are queued for cleanup')
    expect(dialog).toHaveTextContent('Shared content and payment/security records remain')
    const input = within(dialog).getByLabelText('Confirm your email')
    await user.clear(input)
    expect(button).toBeDisabled()
    await user.type(input, 'another@example.com')
    expect(button).toBeDisabled()
    expect(fixture.deleteUser).not.toHaveBeenCalled()
  })

  it('cancels without deleting and clears the previous confirmation', async () => {
    mount()
    const { user, dialog } = await confirm()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Delete account' }))
    expect(screen.getByLabelText('Confirm your email')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Delete permanently' })).toBeDisabled()
    expect(fixture.deleteUser).not.toHaveBeenCalled()
  })

  it('erases only the confirmed account after actual deletion is acknowledged', async () => {
    const client = mount()
    const { user, button } = await confirm()
    await user.click(button)
    await waitFor(() => expect(fixture.removed).toHaveBeenCalledOnce())
    expect(fixture.deleteUser).toHaveBeenCalledExactlyOnceWith({})
    expect(fixture.cleanup).toHaveBeenCalledExactlyOnceWith(client)
    expect(offlineStatus().accountCleanup).toEqual({
      userId: USER_ID,
      pending: false,
      error: null,
    })
    expect(fixture.deleteUser.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.cleanup.mock.invocationCallOrder[0] ?? 0,
    )
  })

  it.each(['ACCOUNT_CLEANUP_PENDING', 'BILLING_CLOSURE_PENDING', 'RECENT_AUTHENTICATION_REQUIRED'])(
    'retains device data and displays %s without claiming removal',
    async (code) => {
      mount()
      fixture.deleteUser.mockResolvedValueOnce({
        data: null,
        error: { message: code, code, status: 503 },
      })
      const { user, button } = await confirm()
      await user.click(button)
      expect(await screen.findByRole('alert')).toHaveTextContent(code)
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
      expect(fixture.cleanup).not.toHaveBeenCalled()
      expect(offlineStatus().accountCleanup).toBeNull()
      expect(fixture.removed).not.toHaveBeenCalled()
    },
  )

  it.each([
    { success: true, message: 'Verification email sent' },
    { success: false, message: 'User deleted' },
  ])('refuses an unconfirmed %j and preserves device data', async (data) => {
    mount()
    fixture.deleteUser.mockResolvedValueOnce({ data, error: null })
    const { user, button } = await confirm()
    await user.click(button)
    expect(await screen.findByRole('alert')).toHaveTextContent('Removal was not confirmed')
    expect(fixture.cleanup).not.toHaveBeenCalled()
    expect(offlineStatus().accountCleanup).toBeNull()
    expect(fixture.removed).not.toHaveBeenCalled()
  })

  it('shows transport failure without erasing device data', async () => {
    mount()
    fixture.deleteUser.mockRejectedValueOnce(new Error('Network unavailable'))
    const { user, button } = await confirm()
    await user.click(button)
    expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable')
    expect(fixture.cleanup).not.toHaveBeenCalled()
    expect(offlineStatus().accountCleanup).toBeNull()
    expect(fixture.removed).not.toHaveBeenCalled()
  })

  it('retains confirmed deletion after failed device cleanup without resubmitting the API', async () => {
    mount()
    fixture.cleanup.mockImplementationOnce(() => {
      updateOfflineStatus({
        accountCleanup: { userId: USER_ID, pending: false, error: 'Device cleanup failed' },
      })
      return Promise.resolve(false)
    })
    const { user, button } = await confirm()
    await user.click(button)
    await waitFor(() => expect(fixture.removed).toHaveBeenCalledOnce())
    expect(offlineStatus().accountCleanup?.error).toBe('Device cleanup failed')
    expect(button).toBeDisabled()
    await user.click(button)
    expect(fixture.deleteUser).toHaveBeenCalledOnce()
  })

  it('blocks a stale account before transport and checks identity after the response', async () => {
    mount()
    const gate = Promise.withResolvers<DeleteResult>()
    fixture.deleteUser.mockReturnValueOnce(gate.promise)
    const { user, button } = await confirm()
    await user.click(button)
    expect(button).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    await user.click(button)
    expect(fixture.deleteUser).toHaveBeenCalledOnce()
    setOfflineUser('another-account')
    gate.resolve(DELETED)
    expect(await screen.findByRole('alert')).toHaveTextContent('account changed')
    expect(fixture.cleanup).not.toHaveBeenCalled()
    expect(fixture.removed).not.toHaveBeenCalled()
  })

  it('rejects an already switched account without sending removal', async () => {
    mount()
    const { user, button } = await confirm()
    setOfflineUser('another-account')
    await user.click(button)
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter your account email exactly')
    expect(fixture.deleteUser).not.toHaveBeenCalled()
    expect(fixture.cleanup).not.toHaveBeenCalled()
  })
})
