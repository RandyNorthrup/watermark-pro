/**
 * Persists the signed-in user's interface language to their account so it
 * follows them to another device (M18). The picker applies the locale locally
 * and to `localStorage` first; this only records the choice on the server.
 */
import { z } from 'zod'

import { ApiRequestError, fetchJson, type RequestAccount } from './api'
import { authClient } from './auth-client'
import { HTTP_STATUS } from '../../shared/constants'
import { type Locale, LOCALE_CODES } from '../../shared/locales'
import { shellSessionSchema } from '../../shared/shell-cache'

const JSON_HEADERS = { 'content-type': 'application/json' }
const SESSION_PATH = '/api/auth/get-session'

/** Echoes the stored locale; validated so a spoofed body cannot reach the UI. */
const savedLocaleSchema = z.object({
  locale: z.union(LOCALE_CODES.map((code) => z.literal(code))),
})

/** The selection stays attached to the displayed session across catalogue and network waits. */
export async function saveLocale(
  locale: Locale,
  account: RequestAccount & { readonly sessionId: string },
): Promise<void> {
  try {
    account.assertCurrent()
    const result = await authClient.getSession({
      query: { disableCookieCache: true },
      fetchOptions: { cache: 'no-store' },
    })
    account.assertCurrent()
    if (result.error !== null) throw new ApiRequestError(SESSION_PATH, result.error.status)
    if (result.data === null) throw new ApiRequestError(SESSION_PATH, HTTP_STATUS.unauthorized)
    const live = shellSessionSchema.parse(result.data)
    if (live.user.id !== account.userId || live.session.id !== account.sessionId)
      throw new Error('The signed-in session changed before saving the language.')
    await fetchJson(
      '/api/me',
      savedLocaleSchema,
      { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ locale }) },
      account,
    )
  } catch (error) {
    account.assertCurrent()
    throw error
  }
}
