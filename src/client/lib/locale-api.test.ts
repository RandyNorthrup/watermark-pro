import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'

import { saveLocale } from './locale-api'
import { setOfflineUser } from './offline-context'
import { API_ERROR_CODE } from '../../shared/constants'

beforeEach(() => setOfflineUser('locale-owner'))

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

    await expect(saveLocale('ja')).resolves.toBeUndefined()

    const [url, init] = fetchSpy.mock.calls[0] ?? []
    expect(url).toBe('/api/me')
    expect(init?.method).toBe('PATCH')
    expect(requestBody(init)).toEqual({ locale: 'ja' })
  })

  it('surfaces the server error code when the request is rejected', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ error: API_ERROR_CODE.validation }, { status: 400 }),
    )

    await expect(saveLocale('ja')).rejects.toMatchObject({
      name: 'ApiRequestError',
      code: API_ERROR_CODE.validation,
    })
  })

  it('rejects a response whose locale is not a supported code', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ locale: 'klingon' }))

    await expect(saveLocale('ja')).rejects.toBeInstanceOf(ZodError)
  })
})
