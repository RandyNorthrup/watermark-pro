/**
 * Persists the signed-in user's interface language to their account so it
 * follows them to another device (M18). The picker applies the locale locally
 * and to `localStorage` first; this only records the choice on the server.
 */
import { z } from 'zod'

import { fetchJson } from './api'
import { type Locale, LOCALE_CODES } from '../../shared/locales'

const JSON_HEADERS = { 'content-type': 'application/json' }

/** Echoes the stored locale; validated so a spoofed body cannot reach the UI. */
const savedLocaleSchema = z.object({
  locale: z.union(LOCALE_CODES.map((code) => z.literal(code))),
})

export async function saveLocale(locale: Locale): Promise<void> {
  await fetchJson('/api/me', savedLocaleSchema, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ locale }),
  })
}
