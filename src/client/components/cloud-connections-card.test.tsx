import { act, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CloudConnectionsCard } from './cloud-connections-card'
import type { CloudConnectionDto } from '../../shared/cloud-connections'
import { notifyCloudConnectionChanged } from '../lib/cloud-connection-context'
import {
  cloudConnections,
  connectCloudProvider,
  disconnectCloudProvider,
} from '../lib/cloud-connections'
import { ACCOUNT_CHANGED_EVENT } from '../lib/offline-account'
import { setOfflineUser } from '../lib/offline-context'

vi.mock('../lib/cloud-connections', () => ({
  cloudConnections: vi.fn(),
  connectCloudProvider: vi.fn(),
  disconnectCloudProvider: vi.fn(),
}))
const CONNECTED: CloudConnectionDto = {
  provider: 'onedrive',
  status: 'connected',
  isConfigured: true,
  accessScope: 'drive',
  accountLabel: 'cloud-owner@example.test',
  providerAccountId: 'cloud-owner',
  generation: 1,
}
const AVAILABLE: CloudConnectionDto = {
  ...CONNECTED,
  provider: 'google',
  status: 'disconnected',
  accessScope: 'selected_files',
  accountLabel: null,
  providerAccountId: null,
}
beforeEach(() => {
  setOfflineUser('owner')
  vi.mocked(cloudConnections).mockResolvedValue({ connections: [CONNECTED, AVAILABLE] })
  vi.mocked(connectCloudProvider).mockResolvedValue()
  vi.mocked(disconnectCloudProvider).mockResolvedValue({
    disconnected: true,
    providerRevoked: false,
  })
})
afterEach(() => vi.resetAllMocks())

describe('account cloud connections', () => {
  it('shows durable account status and separates explicit disconnect from provider permission removal', async () => {
    const user = userEvent.setup()
    render(<CloudConnectionsCard userId="owner" />)
    expect(await screen.findByText('cloud-owner@example.test')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Personal Account/ })).toHaveAttribute(
      'href',
      'https://account.live.com/consent/Manage',
    )
    expect(screen.getByRole('link', { name: /Work Or School/ })).toHaveAttribute(
      'href',
      'https://myapplications.microsoft.com/',
    )
    vi.mocked(cloudConnections).mockResolvedValue({
      connections: [{ ...CONNECTED, status: 'disconnected', accountLabel: null }, AVAILABLE],
    })
    await user.click(screen.getByRole('button', { name: 'Disconnect' }))
    await waitFor(() => expect(disconnectCloudProvider).toHaveBeenCalledWith('onedrive'))
    expect(await screen.findByText(/Remove any remaining provider approval/)).toBeInTheDocument()
    expect(connectCloudProvider).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Connect Google Drive' }))
    expect(connectCloudProvider).toHaveBeenCalledWith('google', expect.any(AbortSignal))
  })

  it('retries failed status requests and never restores a stale account or connection response', async () => {
    const user = userEvent.setup()
    vi.mocked(cloudConnections).mockRejectedValueOnce(new Error('Offline'))
    render(<CloudConnectionsCard userId="owner" />)
    await user.click(await screen.findByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('cloud-owner@example.test')).toBeInTheDocument()
    const older = Promise.withResolvers<{ connections: CloudConnectionDto[] }>()
    vi.mocked(cloudConnections)
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce({ connections: [AVAILABLE] })
    act(() => {
      notifyCloudConnectionChanged()
      notifyCloudConnectionChanged()
    })
    expect(await screen.findByRole('button', { name: 'Connect Google Drive' })).toBeInTheDocument()
    await act(async () => {
      older.resolve({ connections: [CONNECTED] })
      await older.promise
    })
    expect(screen.queryByText('cloud-owner@example.test')).not.toBeInTheDocument()
    act(() => {
      setOfflineUser('other')
      window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT))
    })
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('disables unavailable registrations and reports a failed Connect without claiming success', async () => {
    const user = userEvent.setup()
    vi.mocked(cloudConnections).mockResolvedValue({
      connections: [
        AVAILABLE,
        { ...CONNECTED, provider: 'dropbox', status: 'disconnected', isConfigured: false },
      ],
    })
    vi.mocked(connectCloudProvider).mockRejectedValue(new Error('Consent refused'))
    render(<CloudConnectionsCard userId="owner" />)
    expect(await screen.findByRole('button', { name: 'Connect Dropbox' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Connect Google Drive' }))
    expect(await screen.findByText('Consent refused')).toBeInTheDocument()
    expect(within(screen.getByRole('list')).queryByText('Connected')).not.toBeInTheDocument()
  })

  it('blocks a mismatched account mount before reading cloud identities', async () => {
    render(<CloudConnectionsCard userId="another-account" />)
    expect(await screen.findByText('The signed-in account changed.')).toBeInTheDocument()
    expect(cloudConnections).not.toHaveBeenCalled()
  })

  it('cancels an explicit reconnect without reporting a confirmed cancellation as an error', async () => {
    const user = userEvent.setup()
    vi.mocked(cloudConnections).mockResolvedValue({
      connections: [{ ...AVAILABLE, status: 'reconnect' }],
    })
    const pending = Promise.withResolvers<undefined>()
    vi.mocked(connectCloudProvider).mockReturnValueOnce(pending.promise)
    render(<CloudConnectionsCard userId="owner" />)
    expect(await screen.findByText('Reconnect')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Connect Google Drive' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(vi.mocked(connectCloudProvider).mock.calls[0]?.[1]?.aborted).toBe(true)
    const failure = expect(pending.promise).rejects.toMatchObject({ name: 'AbortError' })
    await act(async () => {
      pending.reject(new DOMException('User cancelled', 'AbortError'))
      await failure
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect Google Drive' })).toBeEnabled()
    expect(disconnectCloudProvider).not.toHaveBeenCalled()
  })

  it('suppresses a failed older connection after account change and after unmount', async () => {
    const user = userEvent.setup()
    const pending = Promise.withResolvers<undefined>()
    vi.mocked(connectCloudProvider).mockReturnValueOnce(pending.promise)
    const { unmount } = render(<CloudConnectionsCard userId="owner" />)
    await user.click(await screen.findByRole('button', { name: 'Connect Google Drive' }))
    const failure = expect(pending.promise).rejects.toThrow('OLD_PROVIDER_ERROR')
    await act(async () => {
      setOfflineUser('other')
      window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT))
      pending.reject(new Error('OLD_PROVIDER_ERROR'))
      await failure
    })
    expect(screen.queryByText('OLD_PROVIDER_ERROR')).not.toBeInTheDocument()
    expect(screen.queryByText('cloud-owner@example.test')).not.toBeInTheDocument()
    unmount()
    expect(vi.mocked(connectCloudProvider).mock.calls[0]?.[1]?.aborted).toBe(true)
  })
})
