import { act, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setLocale } from '../../i18n'
import { RECENT_WORK_CHANGED_EVENT } from '../../lib/recent-work-notifications'
import { seedOwnerWorkspace } from '../../test-support/fake-auth-client'
import { fakeAuth, installFakeAuth } from '../../test-support/fake-auth-module'
import { makePhoto } from '../../test-support/fake-gallery-api'
import { installLibraryApi, makeWatermark } from '../../test-support/fake-library-api'
import { resetFakePreview } from '../../test-support/fake-preview'
import { renderApp } from '../../test-support/render-app'

vi.mock('../../lib/auth-client', () => import('../../test-support/fake-auth-module'))
vi.mock('../../lib/preview', () => import('../../test-support/fake-preview'))
beforeEach(() => {
  installFakeAuth()
  seedOwnerWorkspace(fakeAuth())
  resetFakePreview()
  Object.assign(URL, {
    createObjectURL: vi.fn(() => 'blob:test-preview'),
    revokeObjectURL: vi.fn(),
  })
})
afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await setLocale('en')
})

function seedRecents() {
  const preset = makeWatermark({
    name: 'Private saved mark',
    updatedAt: '2026-09-08T00:00:00.000Z',
  })
  const photo = makePhoto({
    name: 'Private saved photo.jpg',
    createdAt: '2026-01-01T00:00:00.000Z',
  })
  const api = installLibraryApi({
    watermarks: [preset],
    gallery: { photos: [photo], maxBytes: 10_000_000, uploadFailsWith: null },
  })
  api.recents.activity.set(JSON.stringify(['user-1', 'org-1']), [
    { kind: 'preset', resourceId: preset.id, usedAt: '2026-01-01T10:00:00.000Z' },
    { kind: 'photo', resourceId: photo.id, usedAt: '2026-02-01T10:00:00.000Z' },
  ])
  return api
}

/** Vitest's constructor wrapper needs an explicit return to retain the native Intl instance. */
function spyOnDateFormatting() {
  const Formatter = Intl.DateTimeFormat
  return vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function (locale, options) {
    return new Formatter(locale, options)
  })
}

describe('recent work dashboard', () => {
  it('does not initialize a date formatter when no dated rows are rendered', async () => {
    installLibraryApi()
    const formatter = spyOnDateFormatting()
    renderApp('/app')
    expect(await screen.findByText(/Your recent work appears here/)).toBeInTheDocument()
    expect(formatter).not.toHaveBeenCalled()
  })

  it('reuses date formatting for populated rows and updates actual output after a locale change', async () => {
    seedRecents()
    const usedAt = new Date('2026-02-01T10:00:00.000Z')
    const options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }
    const english = new Intl.DateTimeFormat('en', options).format(usedAt)
    const french = new Intl.DateTimeFormat('fr', options).format(usedAt)
    expect(french).not.toBe(english)
    const formatter = spyOnDateFormatting()
    const user = userEvent.setup()
    renderApp('/app')
    expect(await screen.findByText(english)).toHaveAttribute('datetime', usedAt.toISOString())
    expect(formatter).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'Details' }))
    expect(await screen.findByRole('table')).toHaveTextContent(english)
    expect(formatter).toHaveBeenCalledOnce()
    await act(() => setLocale('fr'))
    expect(await screen.findByText(french)).toHaveAttribute('datetime', usedAt.toISOString())
    expect(screen.queryByText(english)).not.toBeInTheDocument()
    expect(formatter).toHaveBeenCalledTimes(2)
    expect(formatter).toHaveBeenLastCalledWith('fr', options)
  })

  it('removes retained private rows when a later authorization refresh is denied', async () => {
    const api = seedRecents()
    renderApp('/app')
    expect(await screen.findByRole('link', { name: 'Private saved mark' })).toBeInTheDocument()
    act(() => {
      api.failWith = 'forbidden'
      window.dispatchEvent(new Event(RECENT_WORK_CHANGED_EVENT))
    })
    expect(await screen.findByText("Couldn't load recent work")).toBeInTheDocument()
    expect(screen.queryByText('Private saved mark')).not.toBeInTheDocument()
    expect(screen.queryByText('Private saved photo.jpg')).not.toBeInTheDocument()
  })

  it('offers three distinct views, orders actual activity, searches, and persists the chosen preference', async () => {
    const api = seedRecents()
    const user = userEvent.setup()
    renderApp('/app')
    const items = await screen.findByRole('list', { name: 'Recent work items' })
    expect(within(items).getAllByRole('listitem')[0]).toHaveTextContent('Private saved photo.jpg')
    expect(screen.getByRole('button', { name: 'Thumbnails' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.click(screen.getByRole('button', { name: 'List' }))
    await waitFor(() => expect(api.recents.views.get('user-1')).toBe('list'))
    expect(screen.getByRole('list', { name: 'Recent work items' })).toHaveClass('divide-y')
    await user.click(screen.getByRole('button', { name: 'Details' }))
    const table = await screen.findByRole('table')
    expect(within(table).getByRole('columnheader', { name: 'Last used' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Location' })).toBeInTheDocument()
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Private saved photo.jpg')
    await waitFor(() => expect(api.recents.views.get('user-1')).toBe('details'))
    await user.type(screen.getByRole('searchbox', { name: 'Search recent work' }), 'saved mark')
    expect(
      screen.queryByRole('button', { name: 'Private saved photo.jpg' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Private saved mark' })).toBeInTheDocument()
    await user.clear(screen.getByRole('searchbox', { name: 'Search recent work' }))
    await user.type(screen.getByRole('searchbox', { name: 'Search recent work' }), 'no match')
    expect(screen.getByText('No recent work matches your search.')).toBeInTheDocument()
  })

  it('opens the actual saved-photo viewer and removes deleted work from Recents', async () => {
    const api = seedRecents()
    const user = userEvent.setup()
    renderApp('/app')
    await user.click(await screen.findByRole('button', { name: 'Private saved photo.jpg' }))
    const viewer = await screen.findByRole('dialog', { name: 'Private saved photo.jpg' })
    expect(within(viewer).getByRole('link', { name: 'Download' })).toHaveAttribute(
      'href',
      '/api/orgs/org-1/photos/photo-1/file',
    )
    await user.click(within(viewer).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(api.gallery.photos).toHaveLength(0))
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Private saved photo.jpg' }),
      ).not.toBeInTheDocument(),
    )
  })

  it('loads only this account’s history and keeps an empty workspace useful', async () => {
    const api = seedRecents()
    api.recents.activity.delete(JSON.stringify(['user-1', 'org-1']))
    api.recents.activity.set(JSON.stringify(['other-account', 'org-1']), [
      { kind: 'preset', resourceId: 'wm-1', usedAt: '2026-03-01T00:00:00.000Z' },
    ])
    api.recents.views.set('other-account', 'details')
    renderApp('/app')
    expect(await screen.findByText(/Your recent work appears here/)).toBeInTheDocument()
    expect(screen.queryByText('Private saved mark')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thumbnails' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('link', { name: 'Open editor' })).toBeInTheDocument()
  })

  it('shows a load error instead of another account’s cached content', async () => {
    const api = installLibraryApi({ failWith: 'forbidden' })
    renderApp('/app')
    expect(await screen.findByText("Couldn't load recent work")).toBeInTheDocument()
    act(() => {
      api.failWith = null
    })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText(/Your recent work appears here/)).toBeInTheDocument()
  })
})
