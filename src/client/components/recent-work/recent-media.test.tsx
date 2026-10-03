import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RecentWork } from './recent-work'
import { LOGO_PNG } from '../../../worker/test-support/image-fixtures'
import { ACCOUNT_CHANGED_EVENT } from '../../lib/offline-account'
import * as offlineContext from '../../lib/offline-context'
import { setOfflineUser } from '../../lib/offline-context'
import type * as OfflineDatabase from '../../lib/offline-database'
import { createQueryClient } from '../../lib/query-client'
import type * as RecentWorkModule from '../../lib/recent-work'
import { makePhoto } from '../../test-support/fake-gallery-api'

vi.mock('../../lib/offline-context', async (original) => ({
  ...(await original<typeof offlineContext>()),
  hasOfflineDatabase: () => true,
}))
vi.mock('../../lib/offline-database', async (original) => ({
  ...(await original<typeof OfflineDatabase>()),
  cacheOfflineRecord: vi.fn(() => Promise.resolve()),
  offlineOperations: vi.fn(() => Promise.resolve([])),
}))
vi.mock('../../lib/recent-work-events', () => ({ noteRecentWork: vi.fn() }))
vi.mock('../../lib/recent-work', async (original) => ({
  ...(await original<typeof RecentWorkModule>()),
  recentWorkQueryOptions: () => ({
    queryKey: ['recent-media-fixture'],
    queryFn: () =>
      Promise.resolve({
        items: [
          {
            kind: 'photo',
            photo: makePhoto(),
            usedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        pendingKeys: [],
        resourceStates: {},
      }),
  }),
  recentViewQueryOptions: () => ({
    queryKey: ['recent-media-view-fixture'],
    queryFn: () => Promise.resolve('list'),
  }),
}))

const ORIGINAL_PATH = '/api/orgs/org-1/photos/photo-1/file'
const ORIGINAL_URL = 'blob:recent-original'
const createUrl = vi.fn<typeof URL.createObjectURL>()
const revokeUrl = vi.fn<typeof URL.revokeObjectURL>()

function renderRecents() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <RecentWork organizationId="org-1" organizationName="Studio" role="viewer" kind="photo" />
    </QueryClientProvider>,
  )
}

async function openPhoto() {
  await userEvent
    .setup()
    .click(await screen.findByRole('button', { name: 'beach-watermarked.jpg' }))
}

beforeEach(() => {
  setOfflineUser('user-1')
  createUrl.mockReset().mockReturnValue(ORIGINAL_URL)
  revokeUrl.mockReset()
  Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revokeUrl })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  setOfflineUser(null)
})

describe('recent original media ownership', () => {
  it('renders exact preflight bytes without starting a second original fetch that never completes', async () => {
    const forever = new Promise<Response>(() => {
      /* This represents the stalled duplicate transport in the real trace. */
    })
    const fetchOriginal = vi
      .fn()
      .mockResolvedValueOnce(new Response(LOGO_PNG, { headers: { 'content-type': 'image/png' } }))
      .mockImplementation(() => forever)
    vi.stubGlobal('fetch', fetchOriginal)
    renderRecents()
    await openPhoto()
    const dialog = await screen.findByRole('dialog')
    await waitFor(() =>
      expect(within(dialog).getByRole('img')).toHaveAttribute('src', ORIGINAL_URL),
    )
    expect(within(dialog).getByRole('link', { name: 'Download' })).toHaveAttribute(
      'href',
      ORIGINAL_URL,
    )
    expect(fetchOriginal).toHaveBeenCalledOnce()
    expect(fetchOriginal.mock.calls[0]?.[0]).toBe(ORIGINAL_PATH)
    const blob = createUrl.mock.calls[0]?.[0]
    if (blob === undefined || !('arrayBuffer' in blob))
      throw new Error('Viewer did not receive the loaded original Blob.')
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(LOGO_PNG)
  })

  it('does not open or create an original URL after a real 403 authorization response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ error: 'forbidden' }, { status: 403 }))),
    )
    renderRecents()
    await openPhoto()
    expect(await screen.findByText('Your role does not allow this.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(createUrl).not.toHaveBeenCalled()
  })

  it('rejects actual recent-work responses containing a foreign workspace before exposing original bytes', async () => {
    vi.spyOn(offlineContext, 'hasOfflineDatabase').mockReturnValue(false)
    const actual = await vi.importActual<typeof RecentWorkModule>('../../lib/recent-work')
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json({
            items: [
              {
                kind: 'photo',
                photo: makePhoto({ organizationId: 'other-org' }),
                usedAt: '2026-01-01T00:00:00.000Z',
              },
            ],
          }),
        ),
      ),
    )
    await expect(createQueryClient().query(actual.recentWorkQueryOptions('org-1'))).rejects.toThrow(
      'Recent activity contains another workspace’s content.',
    )
    expect(createUrl).not.toHaveBeenCalled()
  })

  it('discards a pending original when the account changes before it resolves', async () => {
    const pending = Promise.withResolvers<Response>()
    vi.stubGlobal(
      'fetch',
      vi.fn(() => pending.promise),
    )
    renderRecents()
    await openPhoto()
    act(() => {
      setOfflineUser('other-user')
      window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT))
    })
    await act(async () => {
      pending.resolve(new Response(LOGO_PNG))
      await pending.promise
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(createUrl).not.toHaveBeenCalled()
  })

  it.each(['loaded', 'pending'] as const)(
    'does not expose a %s original after switching workspaces',
    async (state) => {
      const pending = Promise.withResolvers<Response>()
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          state === 'loaded' ? Promise.resolve(new Response(LOGO_PNG)) : pending.promise,
        ),
      )
      const view = renderRecents()
      await openPhoto()
      if (state === 'loaded') {
        const dialog = await screen.findByRole('dialog')
        await waitFor(() =>
          expect(within(dialog).getByRole('img')).toHaveAttribute('src', ORIGINAL_URL),
        )
      }
      view.rerender(
        <QueryClientProvider client={createQueryClient()}>
          <RecentWork
            organizationId="other-org"
            organizationName="Other studio"
            role="viewer"
            kind="photo"
          />
        </QueryClientProvider>,
      )
      if (state === 'pending')
        await act(async () => {
          pending.resolve(new Response(LOGO_PNG))
          await pending.promise
        })
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      if (state === 'loaded') expect(revokeUrl).toHaveBeenCalledWith(ORIGINAL_URL)
      else expect(createUrl).not.toHaveBeenCalled()
    },
  )

  it.each(['close', 'account', 'unmount'] as const)(
    'revokes the exact original URL on %s',
    async (boundary) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve(new Response(LOGO_PNG))),
      )
      const view = renderRecents()
      await openPhoto()
      const dialog = await screen.findByRole('dialog')
      await waitFor(() =>
        expect(within(dialog).getByRole('img')).toHaveAttribute('src', ORIGINAL_URL),
      )
      if (boundary === 'close')
        await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Close' }))
      else if (boundary === 'account')
        act(() => {
          setOfflineUser('other-user')
          window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT))
        })
      else view.unmount()
      await waitFor(() => expect(revokeUrl).toHaveBeenCalledWith(ORIGINAL_URL))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    },
  )
})
