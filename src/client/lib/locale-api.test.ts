import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'

import { saveLocale } from './locale-api'
import { captureOfflineGeneration, currentOfflineUser, setOfflineUser } from './offline-context'
import { ACCOUNT_ID_HEADER } from '../../shared/account-identity'
import { API_ERROR_CODE } from '../../shared/constants'
import { OWNER } from '../test-support/fake-auth-client'
import { fakeAuth, installFakeAuth } from '../test-support/fake-auth-module'

vi.mock('./auth-client', () => import('../test-support/fake-auth-module'))

beforeEach(() => {
  setOfflineUser(null)
  installFakeAuth().state.user = OWNER
})

function account() {
  return { userId: OWNER.id, sessionId: 'session-1', ...captureOfflineGeneration() }
}

afterEach(() => {
  setOfflineUser(null)
  vi.restoreAllMocks()
})

/** The JSON body of a captured `fetch` call, narrowed off `BodyInit`. */
function requestBody(init: RequestInit | undefined): unknown {
  const body = init?.body
  if (typeof body !== 'string') {
    throw new TypeError('expected a string request body')
  }
  return JSON.parse(body)
}

describe('saveLocale', () => {
  it('PATCHes the chosen locale to /api/me and accepts the echoed value', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ locale: 'ja' }))

    await expect(saveLocale('ja', account())).resolves.toBeUndefined()

    const [url, init] = fetchSpy.mock.calls[0] ?? []
    expect(url).toBe('/api/me')
    expect(init?.method).toBe('PATCH')
    expect(requestBody(init)).toEqual({ locale: 'ja' })
    expect(new Headers(init?.headers).get(ACCOUNT_ID_HEADER)).toBe(OWNER.id)
    expect(currentOfflineUser()).toBeNull()
  })

  it('surfaces the server error code when the request is rejected', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ error: API_ERROR_CODE.validation }, { status: 400 }),
    )

    await expect(saveLocale('ja', account())).rejects.toMatchObject({
      name: 'ApiRequestError',
      code: API_ERROR_CODE.validation,
    })
  })

  it('rejects a response whose locale is not a supported code', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ locale: 'klingon' }))

    await expect(saveLocale('ja', account())).rejects.toBeInstanceOf(ZodError)
  })

  it('refuses an expired live session before issuing the profile mutation', async () => {
    fakeAuth().state.user = null
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await expect(saveLocale('ja', account())).rejects.toMatchObject({ status: 401 })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refuses an error from live session validation before issuing the mutation', async () => {
    fakeAuth().getSession.mockResolvedValue({
      data: null,
      error: { status: 403, code: 'FORBIDDEN', message: 'Private provider detail' },
    })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await expect(saveLocale('ja', account())).rejects.toMatchObject({
      status: 403,
      message: 'Request to /api/auth/get-session failed with HTTP 403',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refuses mixed user/session identity even when the displayed session id matches', async () => {
    fakeAuth().getSession.mockResolvedValue({
      error: null,
      data: {
        user: OWNER,
        session: { id: 'session-1', userId: 'another-account', activeOrganizationId: null },
      },
    })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await expect(saveLocale('ja', account())).rejects.toThrow('Session account does not match')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refuses a session reply that arrives after a null-owner relock', async () => {
    const live = await fakeAuth().getSession()
    const session = Promise.withResolvers<typeof live>()
    fakeAuth().getSession.mockReturnValue(session.promise)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const pending = saveLocale('ja', account())
    const rejected = expect(pending).rejects.toThrow('account changed')
    setOfflineUser(null)
    session.resolve(live)
    await rejected
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it.each([200, 401, 403])(
    'refuses delayed PATCH headers after an account switch (%s)',
    async (status) => {
      const headers = Promise.withResolvers<Response>()
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(headers.promise)
      const pending = saveLocale('ja', account())
      const rejected = expect(pending).rejects.toThrow('account changed')
      await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce())
      setOfflineUser('another-account')
      headers.resolve(Response.json({ locale: 'ja' }, { status }))
      await rejected
    },
  )

  it.each([200, 401, 403])(
    'refuses a delayed PATCH body after null-owner relock (%s)',
    async (status) => {
      const body = Promise.withResolvers<unknown>()
      const response = Response.json({ locale: 'ja' }, { status })
      const jsonSpy = vi.spyOn(response, 'json').mockReturnValue(body.promise)
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(response)
      const pending = saveLocale('ja', account())
      const rejected = expect(pending).rejects.toThrow('account changed')
      await vi.waitFor(() => expect(jsonSpy).toHaveBeenCalledOnce())
      setOfflineUser(null)
      body.resolve({ locale: 'ja' })
      await rejected
    },
  )
})
