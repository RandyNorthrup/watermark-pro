import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LanguageMenu } from './language-menu'
import { SUPPORTED_LOCALES } from '../../shared/locales'
import { setLocale } from '../i18n'
import { setOfflineUser } from '../lib/offline-context'
import { sessionQueryOptions } from '../lib/queries'
import { createQueryClient } from '../lib/query-client'
import french from '../locales/fr/common.json'
import { OWNER } from '../test-support/fake-auth-client'
import { fakeAuth, installFakeAuth } from '../test-support/fake-auth-module'

vi.mock('../lib/auth-client', () => import('../test-support/fake-auth-module'))

/**
 * Mounts the menu with a real query client, resolving the session before the
 * first paint. `isSignedIn` decides whether the account save runs: a member
 * has a session, the landing/auth pages do not.
 */
async function mountMenu(isSignedIn: boolean): Promise<void> {
  const queryClient = createQueryClient()
  if (isSignedIn) {
    fakeAuth().state.user = OWNER
    setOfflineUser(OWNER.id)
  }
  await queryClient.query(sessionQueryOptions)
  render(
    <QueryClientProvider client={queryClient}>
      <LanguageMenu />
    </QueryClientProvider>,
  )
}

async function pickLanguage(nativeName: string): Promise<void> {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Change language' }))
  await user.click(within(screen.getByRole('menu')).getByText(nativeName))
}

/** The JSON body of a captured `fetch` call, narrowed off `BodyInit`. */
function requestBody(init: RequestInit | undefined): unknown {
  const body = init?.body
  if (typeof body !== 'string') {
    throw new TypeError('expected a string request body')
  }
  return JSON.parse(body)
}

beforeEach(() => {
  installFakeAuth()
  setOfflineUser(null)
})

afterEach(async () => {
  vi.restoreAllMocks()
  i18next.addResourceBundle('fr', 'common', french, true, true)
  // Leave the shared instance back on English for any later test.
  await setLocale('en')
})

describe('LanguageMenu', () => {
  it('does not save an old account choice to a new account after a delayed catalogue download', async () => {
    await mountMenu(true)
    i18next.removeResourceBundle('fr', 'common')
    const download = Promise.withResolvers<Response>()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => download.promise)
    await pickLanguage('Français')
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce())
    setOfflineUser('different-account')
    act(() => {
      download.resolve(Response.json(french))
    })
    await waitFor(() => expect(document.documentElement.lang).toBe('fr'))
    expect(fetchSpy.mock.calls.some(([url]) => url === '/api/me')).toBe(false)
  })
  it('lists every language by its native name and applies the choice', async () => {
    await mountMenu(false)

    await pickLanguage('العربية')
    await waitFor(() => expect(document.documentElement.dir).toBe('rtl'))
    expect(document.documentElement.lang).toBe('ar')

    const menuNames = SUPPORTED_LOCALES.map((locale) => locale.name)
    expect(menuNames).toContain('Español')
    expect(menuNames).toContain('日本語')
  })

  it('saves the choice to the account when the user is signed in', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ locale: 'es' }))
    await mountMenu(true)

    await pickLanguage('Español')

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    const [url, init] = fetchSpy.mock.calls[0] ?? []
    expect(url).toBe('/api/me')
    expect(init?.method).toBe('PATCH')
    expect(requestBody(init)).toEqual({ locale: 'es' })
  })

  it('still switches locally when the account save fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    await mountMenu(true)

    await pickLanguage('Deutsch')

    // The rejected save is swallowed; the interface language still changed.
    await waitFor(() => expect(document.documentElement.lang).toBe('de'))
  })

  it('does not touch the account when there is no session', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await mountMenu(false)

    await pickLanguage('Español')

    await waitFor(() => expect(document.documentElement.lang).toBe('es'))
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
