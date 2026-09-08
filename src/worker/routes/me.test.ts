import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { API_ERROR_CODE, HTTP_STATUS } from '../../shared/constants'
import { errorCodeOf, TestClient } from '../test-support/client'
import { createTestHarness, type TestHarness } from '../test-support/test-app'

const user = {
  name: 'Lena Locale',
  email: 'lena@example.test',
  password: 'a perfectly fine passphrase',
}

const localeResponseSchema = z.object({ locale: z.string() })
// An unset locale is simply absent from the session user, so treat it as null.
const sessionUserSchema = z.object({ user: z.object({ locale: z.string().nullish() }) })

let harness: TestHarness

function patchLocale(client: TestClient, body: unknown): Promise<Response> {
  return client.request('/api/me', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function savedLocale(client: TestClient): Promise<string | null> {
  const response = await client.get('/api/auth/get-session')
  return sessionUserSchema.parse(await response.json()).user.locale ?? null
}

beforeEach(() => {
  harness = createTestHarness()
})

describe('PATCH /api/me', () => {
  it('saves a supported locale on the signed-in user and returns it', async () => {
    const client = new TestClient(harness.app, harness.env)
    await client.signUpAndVerify(harness.mailbox, user)
    expect(await savedLocale(client)).toBeNull()

    const response = await patchLocale(client, { locale: 'ar' })
    expect(response.status).toBe(HTTP_STATUS.ok)
    expect(localeResponseSchema.parse(await response.json())).toEqual({ locale: 'ar' })

    // The choice persists on the account, so a later session reads it back.
    expect(await savedLocale(client)).toBe('ar')

    // A second change overwrites the first rather than accumulating.
    const changed = await patchLocale(client, { locale: 'es' })
    expect(changed.status).toBe(HTTP_STATUS.ok)
    expect(await savedLocale(client)).toBe('es')
  })

  it('rejects an unsupported locale with a validation envelope', async () => {
    const client = new TestClient(harness.app, harness.env)
    await client.signUpAndVerify(harness.mailbox, user)

    const garbage = await patchLocale(client, { locale: 'klingon' })
    expect(garbage.status).toBe(HTTP_STATUS.badRequest)
    expect(await errorCodeOf(garbage)).toBe(API_ERROR_CODE.validation)

    // A non-JSON body is refused the same way, and neither call stored anything.
    const notJson = await client.request('/api/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    })
    expect(notJson.status).toBe(HTTP_STATUS.badRequest)
    expect(await savedLocale(client)).toBeNull()
  })

  it('refuses an unauthenticated request', async () => {
    const anonymous = await patchLocale(new TestClient(harness.app, harness.env), { locale: 'de' })
    expect(anonymous.status).toBe(HTTP_STATUS.unauthorized)
    expect(await errorCodeOf(anonymous)).toBe(API_ERROR_CODE.unauthenticated)
  })
})
