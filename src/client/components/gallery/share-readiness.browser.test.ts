import { QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createInstance } from 'i18next'
import { createElement } from 'react'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ShareDialog } from './share-dialog'
import { setOfflineUser } from '../../lib/offline-context'
import * as database from '../../lib/offline-database'
import type { PendingOperation } from '../../lib/offline-model'
import { updateOfflineStatus } from '../../lib/offline-status'
import { createQueryClient } from '../../lib/query-client'
import en from '../../locales/en/common.json'
import { makeShare } from '../../test-support/fake-share-api'
import {
  OFFLINE_ORG,
  OFFLINE_USER,
  offlineOperation,
  offlinePhoto,
  offlinePreset,
} from '../../test-support/offline-fixtures'
import { requestUrl } from '../../test-support/request-url'

vi.mock('../../lib/offline-database', { spy: true })

const i18n = createInstance()
const queryClient = createQueryClient()
const WAITING = 'Wait for the selected photos to finish syncing before creating a link.'
const BLOCKED = 'Resolve syncing issues for the selected photos before creating a link.'
const shared = vi.fn()

beforeEach(async () => {
  await database.clearOfflineDatabase()
  setOfflineUser(OFFLINE_USER)
  updateOfflineStatus({ pending: 0, blocked: 0, syncing: false, problem: null, isOnline: true })
  shared.mockClear()
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = requestUrl(input)
      if (url.endsWith('/shares') && init.method === 'POST') {
        shared(url, init)
        return Promise.resolve(Response.json(makeShare()))
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`))
    }),
  )
  await i18n.init({
    lng: 'en',
    defaultNS: 'common',
    resources: { en: { common: en } },
    interpolation: { escapeValue: false },
  })
})

afterEach(() => {
  cleanup()
  queryClient.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function content(photoIds: string[], organizationId = OFFLINE_ORG) {
  const dialog = createElement(ShareDialog, {
    organizationId,
    photoIds,
    defaultTitle: 'Selected Photo',
    trigger: createElement('button', { type: 'button' }, 'Share Photos'),
  })
  return createElement(
    I18nextProvider,
    { i18n },
    createElement(QueryClientProvider, { client: queryClient }, dialog),
  )
}

async function queuedPhoto(state: PendingOperation['state'] = 'pending') {
  const photo = offlinePhoto()
  const operation = offlineOperation({
    kind: 'photo-upload',
    photo,
    blob: new Blob(['image']),
    thumbnail: new Blob(['thumbnail']),
  })
  await database.commitOfflineChange({ ...operation, state })
  const operations = await database.offlineOperations(OFFLINE_USER)
  const stored = operations.find((item) => item.id === operation.id)
  if (stored === undefined) throw new Error('Expected the persisted photo operation')
  return { photo, stored }
}

async function openShare(photoIds: string[]) {
  const user = userEvent.setup()
  const view = render(content(photoIds))
  await user.click(screen.getByRole('button', { name: 'Share Photos' }))
  return { user, view, create: screen.getByRole('button', { name: 'Create link' }) }
}

describe('sharing waits for selected photo acknowledgements', () => {
  it.each(['pending', 'blocked', 'conflict'] as const)(
    'refuses a selected %s upload without sending a share request',
    async (state) => {
      const { photo } = await queuedPhoto(state)
      const { user, create } = await openShare([photo.id])
      await screen.findByText(state === 'pending' ? WAITING : BLOCKED)
      expect(create).toBeDisabled()
      await user.click(create)
      expect(shared).not.toHaveBeenCalled()
    },
  )

  it('keeps Create Link disabled until delayed server acknowledgement is persisted, then permits sharing', async () => {
    const { photo, stored } = await queuedPhoto()
    const { user, create } = await openShare([photo.id])
    await screen.findByText(WAITING)
    act(() => {
      updateOfflineStatus({ pending: 1, syncing: true })
    })
    expect(create).toBeDisabled()
    expect(shared).not.toHaveBeenCalled()
    await act(async () => {
      await database.updatePendingOperation({ ...stored, state: 'synced' })
      updateOfflineStatus({ pending: 0, syncing: false })
    })
    await waitFor(() => expect(create).toBeEnabled())
    await user.click(create)
    await screen.findByLabelText('Link')
    expect(shared).toHaveBeenCalledOnce()
    const init: unknown = shared.mock.calls[0]?.[1]
    expect(init).toMatchObject({
      body: JSON.stringify({ title: 'Selected Photo', photoIds: [photo.id], expiresInDays: 7 }),
    })
  })

  it('allows an already confirmed photo despite unrelated or foreign-workspace pending work', async () => {
    const { photo } = await queuedPhoto('synced')
    await queuedPhoto('blocked')
    await database.commitOfflineChange({
      ...offlineOperation({ kind: 'preset-create', preset: offlinePreset() }),
      state: 'conflict',
    })
    await database.commitOfflineChange(
      offlineOperation({ kind: 'photo-delete', photoIds: [photo.id] }, 'other-workspace'),
    )
    const { user, create } = await openShare([photo.id])
    await waitFor(() => expect(create).toBeEnabled())
    await user.click(create)
    await screen.findByLabelText('Link')
    expect(shared).toHaveBeenCalledOnce()
  })

  it('rechecks local changes at submission and rejects a newly queued deletion', async () => {
    const photo = offlinePhoto()
    const { user, create } = await openShare([photo.id])
    await waitFor(() => expect(create).toBeEnabled())
    await database.commitOfflineChange(
      offlineOperation({ kind: 'photo-delete', photoIds: [photo.id] }),
    )
    await user.click(create)
    await screen.findByText(WAITING)
    expect(shared).not.toHaveBeenCalled()
    expect(create).toBeDisabled()
  })

  it.each(['account', 'workspace', 'close'] as const)(
    'refuses delayed preflight completion after the %s changes',
    async (change) => {
      const photo = offlinePhoto()
      const { user, create, view } = await openShare([photo.id])
      await waitFor(() => expect(create).toBeEnabled())
      const pending = Promise.withResolvers<PendingOperation[]>()
      vi.mocked(database.pendingOperations).mockImplementationOnce(() => pending.promise)
      await user.click(create)
      if (change === 'account') setOfflineUser('another-account')
      else if (change === 'workspace') view.rerender(content([photo.id], 'another-workspace'))
      else await user.click(screen.getByRole('button', { name: 'Cancel' }))
      await act(async () => {
        pending.resolve([])
        await pending.promise
      })
      expect(shared).not.toHaveBeenCalled()
      expect(screen.queryByLabelText('Link')).toBeNull()
    },
  )
})
