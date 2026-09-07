/* eslint-disable unicorn/prefer-https -- these tests deliberately use http:// URLs to prove the policy refuses them */
/**
 * Runs inside workerd. Proves the import route is mounted and the real
 * IMPORT_RATE_LIMITER binding is callable there — the SSRF policy rejects a
 * non-https link after the rate-limit check, without any upstream fetch. The
 * fetch-and-stream logic is covered against a mocked `fetch` in imports.test.ts.
 */
import { env } from 'cloudflare:workers'

import { beforeAll, describe, expect, it } from 'vitest'

import { createApp } from './index'
import { getServices } from './services'
import { errorCodeOf, TestClient } from './test-support/client'
import { API_ERROR_CODE, HTTP_STATUS } from '../shared/constants'

const app = createApp()
const owner = {
  name: 'Ivan Import',
  email: 'ivan@example.test',
  password: 'a perfectly fine passphrase',
}

function mailbox() {
  const { devMailbox } = getServices(env)
  if (devMailbox === undefined) {
    throw new Error('workers tests expect EMAIL_PROVIDER=console')
  }
  return devMailbox
}

describe('import from a URL over D1', () => {
  let client: TestClient
  let organizationId: string

  beforeAll(async () => {
    client = new TestClient(app, env)
    await client.signUpAndVerify(mailbox(), owner)
    organizationId = await client.createOrganization('Import Studio', 'import-studio')
  })

  it('runs the SSRF policy and the real rate-limit binding in workerd', async () => {
    const response = await client.request(`/api/orgs/${organizationId}/imports/url`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'http://cdn.example.com/a.png' }),
    })
    expect(response.status).toBe(HTTP_STATUS.badRequest)
    expect(await errorCodeOf(response)).toBe(API_ERROR_CODE.unsupportedUrl)
  })
})
