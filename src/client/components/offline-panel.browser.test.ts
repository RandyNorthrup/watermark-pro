/** Recovery controls exercise real local persistence, including cancel, discard, retry and conflict copying. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createInstance } from 'i18next'
import { createElement } from 'react'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { OfflinePanel } from './offline-panel'
import { setOfflineUser } from '../lib/offline-context'
import {
  clearOfflineDatabase,
  commitOfflineChange,
  offlineOperations,
  pendingOperations,
  updatePendingOperation,
} from '../lib/offline-database'
import { updateOfflineStatus } from '../lib/offline-status'
import { synchronizeOfflineWork } from '../lib/offline-sync'
import en from '../locales/en/common.json'
import { fakeAuth, installFakeAuth } from '../test-support/fake-auth-module'
import { OFFLINE_USER, offlineOperation, offlinePreset } from '../test-support/offline-fixtures'

vi.mock('../lib/auth-client', () => import('../test-support/fake-auth-module'))

const i18n = createInstance()
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

beforeEach(async () => {
  await clearOfflineDatabase()
  setOfflineUser(OFFLINE_USER)
  updateOfflineStatus({ pending: 0, blocked: 0, syncing: false, problem: null })
  installFakeAuth()
  fakeAuth().state.user = {
    id: OFFLINE_USER,
    name: 'Offline Owner',
    email: 'offline@example.test',
    emailVerified: true,
    image: null,
  }
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  await i18n.init({
    lng: 'en',
    defaultNS: 'common',
    resources: { en: { common: en } },
    interpolation: { escapeValue: false },
  })
})
afterEach(async () => {
  cleanup()
  await synchronizeOfflineWork(queryClient)
  queryClient.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function showPanel(shouldManageSync = true) {
  const panel = createElement(OfflinePanel, { userId: OFFLINE_USER, shouldManageSync })
  const queryProvider = createElement(QueryClientProvider, { client: queryClient }, panel)
  render(createElement(I18nextProvider, { i18n }, queryProvider))
}

describe('offline recovery panel', () => {
  it('shares pending recovery controls without installing another sync loop for the phone menu', async () => {
    const listen = vi.spyOn(window, 'addEventListener')
    const syncListeners = () =>
      listen.mock.calls.filter(([event]) => event === 'watermark-pro:offline-change')
    await commitOfflineChange(offlineOperation({ kind: 'preset-create', preset: offlinePreset() }))
    showPanel()
    await screen.findByText('Review saved work (1)')
    expect(syncListeners()).toHaveLength(1)
    showPanel(false)
    expect(syncListeners()).toHaveLength(1)
    expect(await screen.findAllByText('Review saved work (1)')).toHaveLength(2)
    const buttons = screen.getAllByRole('button', { name: 'Sync now' })
    for (const button of buttons) {
      expect(button.hasAttribute('disabled')).toBe(true)
    }
  })
  it('keeps a save on cancel and removes it only after confirming discard', async () => {
    const user = userEvent.setup()
    await commitOfflineChange(offlineOperation({ kind: 'preset-create', preset: offlinePreset() }))
    showPanel()
    await user.click(await screen.findByText('Review saved work (1)'))
    expect(screen.getByRole('button', { name: 'Sync now' }).hasAttribute('disabled')).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Discard local change' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(await pendingOperations(OFFLINE_USER)).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Discard local change' }))
    const confirmation = await screen.findByRole('alertdialog')
    await user.click(within(confirmation).getByRole('button', { name: 'Discard local change' }))
    await expect
      .poll(async () => {
        const pending = await pendingOperations(OFFLINE_USER)
        return pending.length
      })
      .toBe(0)
  })

  it('copies a conflicted preset instead of replacing the remote version', async () => {
    const user = userEvent.setup()
    const preset = offlinePreset('Conflicting preset')
    await commitOfflineChange(offlineOperation({ kind: 'preset-create', preset }))
    const [pending] = await pendingOperations(OFFLINE_USER)
    if (pending === undefined) {
      throw new Error('Expected pending work')
    }
    await updatePendingOperation({ ...pending, state: 'conflict', error: 'Changed elsewhere' })
    showPanel()
    await user.click(await screen.findByText('Review saved work (1)'))
    expect(await screen.findByText(/This preset changed elsewhere/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Keep both versions' }))
    await expect
      .poll(async () => {
        const operations = await pendingOperations(OFFLINE_USER)
        return (
          operations.length === 1 &&
          operations[0]?.state === 'pending' &&
          operations[0].id !== pending.id
        )
      })
      .toBe(true)
    const copies = await offlineOperations(OFFLINE_USER)
    expect(copies[0]?.change).toMatchObject({
      kind: 'preset-create',
      preset: { name: 'Conflicting preset' },
    })
  })

  it('retries blocked work and displays server confirmation after success', async () => {
    const user = userEvent.setup()
    const preset = offlinePreset()
    await commitOfflineChange(offlineOperation({ kind: 'preset-create', preset }))
    const [pending] = await pendingOperations(OFFLINE_USER)
    if (pending === undefined) {
      throw new Error('Expected pending work')
    }
    await updatePendingOperation({ ...pending, state: 'blocked', error: 'Permission was removed' })
    showPanel()
    await user.click(await screen.findByText('Review saved work (1)'))
    expect(await screen.findByText('Permission was removed')).toBeTruthy()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json(preset))),
    )
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByText('Saved work is synchronized.')
    expect(await pendingOperations(OFFLINE_USER)).toEqual([])
  })
})
