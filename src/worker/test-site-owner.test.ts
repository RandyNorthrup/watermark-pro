import { afterEach, describe, expect, it, vi } from 'vitest'

import { TestClient } from './test-support/client'
import { createTestHarness, TEST_APP_URL } from './test-support/test-app'
import { ensureTestSiteOwner, TEST_SITE_OWNER } from '../../scripts/lib/test-site-owner'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function localServer() {
  const harness = createTestHarness()
  vi.spyOn(console, 'info').mockImplementation(vi.fn())
  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) =>
      await harness.app.fetch(new Request(input, init), harness.env),
  )
  return harness
}

describe('isolated shared verification site owner', () => {
  it('bootstraps once and authenticates independent sessions for successive gate callers', async () => {
    const harness = localServer()
    const first = await ensureTestSiteOwner(TEST_APP_URL)
    const second = await ensureTestSiteOwner(TEST_APP_URL)
    expect(first.organizationId).toBe(second.organizationId)
    expect(first.cookie).not.toBe(second.cookie)
    const context = await harness.services.auth.$context
    expect(await context.adapter.count({ model: 'user' })).toBe(1)
    expect(await context.adapter.count({ model: 'session' })).toBeGreaterThan(1)
    const account = await context.adapter.findOne<{
      id: string
      role: string
      emailVerified: boolean
    }>({ model: 'user', where: [{ field: 'email', value: TEST_SITE_OWNER.email }] })
    expect(account).toMatchObject({ role: 'owner', emailVerified: true })
    expect(await harness.services.accounts.siteOwnerId()).toBe(account?.id)
    for (const result of [first, second]) {
      const response = await harness.app.fetch(
        new Request(`${TEST_APP_URL}/api/admin/account-stats`, {
          headers: { cookie: result.cookie },
        }),
        harness.env,
      )
      expect(response.status).toBe(200)
    }
  })
  it('cannot replace an existing site owner', async () => {
    const harness = localServer()
    const client = new TestClient(harness.app, harness.env)
    const other = {
      name: 'Existing owner',
      email: 'existing-owner@example.test',
      password: 'existing owner passphrase',
    }
    await client.signUpAndVerify(harness.mailbox, other)
    await harness.services.users.promoteToSiteOwner(other.email)
    const original = await harness.services.accounts.siteOwnerId()
    await expect(ensureTestSiteOwner(TEST_APP_URL)).rejects.toThrow('another site owner')
    expect(await harness.services.accounts.siteOwnerId()).toBe(original)
  })
  it.each([
    'https://lumafoil.com',
    'https://example.test',
    'http://localhost:5273/path',
    'http://localhost:5273/?secret=x',
    'http://user:password@localhost:5273',
  ])('rejects a non-gate origin before requesting %s', async (origin) => {
    const request = vi.fn()
    vi.stubGlobal('fetch', request)
    await expect(ensureTestSiteOwner(origin)).rejects.toThrow('loopback HTTP')
    expect(request).not.toHaveBeenCalled()
  })
  it('refuses a server whose development mailbox is disabled', async () => {
    const harness = localServer()
    harness.services.devMailbox = undefined
    await expect(ensureTestSiteOwner(TEST_APP_URL)).rejects.toThrow('console-mailbox')
    const context = await harness.services.auth.$context
    expect(await context.adapter.count({ model: 'user' })).toBe(0)
  })
})
