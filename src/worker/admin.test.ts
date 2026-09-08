import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { errorCodeOf, signUpOwner, TestClient } from './test-support/client'
import { createTestHarness, type TestHarness } from './test-support/test-app'
import {
  adminClientErrorListSchema,
  adminHealthListSchema,
  adminOrganizationListSchema,
  auditListResponseSchema,
  publicConfigSchema,
} from '../shared/api'
import { API_ERROR_CODE, HTTP_STATUS } from '../shared/constants'

const owner = {
  name: 'Ada Admin',
  email: 'ada@example.test',
  password: 'correct horse battery',
}
const other = {
  name: 'Otto Other',
  email: 'otto@example.test',
  password: 'another long password',
}
const listedUserSchema = z.object({ id: z.string(), email: z.string() })
const userListSchema = z.object({ users: z.array(listedUserSchema), total: z.number() })

let harness: TestHarness
let adminClient: TestClient

/** Promotes a user to platform admin straight in the auth database. */
async function promote(userId: string) {
  const { adapter } = await harness.services.auth.$context
  await adapter.update({
    model: 'user',
    where: [{ field: 'id', value: userId }],
    update: { role: 'admin' },
  })
}

/** The status of a request, for one-line assertions. */
async function statusOf(response: Promise<Response>): Promise<number> {
  const settled = await response
  return settled.status
}

async function currentUserId(client: TestClient): Promise<string> {
  const response = await client.get('/api/auth/get-session')
  return z.object({ user: z.object({ id: z.string() }) }).parse(await response.json()).user.id
}

beforeEach(async () => {
  harness = createTestHarness()
  ;({ client: adminClient } = await signUpOwner(harness, owner, {
    name: 'Admin Org',
    slug: 'admin-org',
  }))
  await promote(await currentUserId(adminClient))
})

describe('dev promotion route', () => {
  it('promotes an existing account only while the console provider is configured', async () => {
    const otherClient = new TestClient(harness.app, harness.env)
    await otherClient.signUpAndVerify(harness.mailbox, other)
    expect(await statusOf(otherClient.get('/api/admin/audit'))).toBe(HTTP_STATUS.forbidden)

    expect(await statusOf(otherClient.post('/api/dev/promote', { email: 'not an email' }))).toBe(
      HTTP_STATUS.badRequest,
    )
    expect(
      await statusOf(otherClient.post('/api/dev/promote', { email: 'nobody@example.test' })),
    ).toBe(HTTP_STATUS.notFound)
    expect(await statusOf(otherClient.post('/api/dev/promote', { email: other.email }))).toBe(
      HTTP_STATUS.ok,
    )
    expect(await statusOf(otherClient.get('/api/admin/audit'))).toBe(HTTP_STATUS.ok)

    // Without the console provider (production) the route does not exist.
    harness.services.devMailbox = undefined
    expect(await statusOf(otherClient.post('/api/dev/promote', { email: other.email }))).toBe(
      HTTP_STATUS.notFound,
    )
    expect(await statusOf(otherClient.get('/api/dev/mailbox'))).toBe(HTTP_STATUS.notFound)
  })
})

describe('platform administration', () => {
  it('lists every organization with member and storage counts for platform admins only', async () => {
    const otherClient = new TestClient(harness.app, harness.env)
    await otherClient.signUpAndVerify(harness.mailbox, other)
    const otherOrgId = await otherClient.createOrganization('Other Org', 'other-org')
    await harness.services.photos.create({
      id: 'p1',
      organizationId: otherOrgId,
      name: 'p',
      key: 'k',
      thumbnailKey: 't',
      contentType: 'image/png',
      size: 1234,
      width: 1,
      height: 1,
      presetId: null,
      presetName: null,
      createdBy: null,
    })

    const denied = await otherClient.get('/api/admin/organizations')
    expect(denied.status).toBe(HTTP_STATUS.forbidden)
    expect(await errorCodeOf(denied)).toBe(API_ERROR_CODE.forbidden)
    const anonymous = await new TestClient(harness.app, harness.env).get('/api/admin/organizations')
    expect(anonymous.status).toBe(HTTP_STATUS.unauthorized)

    const listed = await adminClient.get('/api/admin/organizations')
    expect(listed.status).toBe(HTTP_STATUS.ok)
    const { organizations } = adminOrganizationListSchema.parse(await listed.json())
    expect(organizations.map((organization) => organization.name)).toEqual([
      'Other Org',
      'Admin Org',
    ])
    expect(organizations[0]).toMatchObject({ memberCount: 1, photoCount: 1, storageBytes: 1234 })
    expect(organizations[1]).toMatchObject({ memberCount: 1, photoCount: 0, storageBytes: 0 })
  })

  it('shows the global audit trail and records admin actions in it', async () => {
    const otherClient = new TestClient(harness.app, harness.env)
    await otherClient.signUpAndVerify(harness.mailbox, other)
    const otherId = await currentUserId(otherClient)

    const banned = await adminClient.post('/api/auth/admin/ban-user', {
      userId: otherId,
      banReason: 'spam',
    })
    expect(banned.status).toBe(HTTP_STATUS.ok)
    const signIn = await otherClient.post('/api/auth/sign-in/email', {
      email: other.email,
      password: other.password,
    })
    expect(signIn.status).toBe(HTTP_STATUS.forbidden)
    const promoted = await adminClient.post('/api/auth/admin/set-role', {
      userId: otherId,
      role: 'admin',
    })
    expect(promoted.status).toBe(HTTP_STATUS.ok)
    const unbanned = await adminClient.post('/api/auth/admin/unban-user', { userId: otherId })
    expect(unbanned.status).toBe(HTTP_STATUS.ok)

    const trail = await adminClient.get('/api/admin/audit')
    expect(trail.status).toBe(HTTP_STATUS.ok)
    const { entries } = auditListResponseSchema.parse(await trail.json())
    const actions = entries.map((entry) => entry.action)
    expect(actions).toEqual(
      expect.arrayContaining([
        'admin.user_banned',
        'admin.role_set',
        'admin.user_unbanned',
        'organization.created',
      ]),
    )
    const roleEntry = entries.find((entry) => entry.action === 'admin.role_set')
    expect(roleEntry).toMatchObject({
      organizationId: null,
      targetId: otherId,
      metadata: { role: 'admin' },
    })

    const users = await adminClient.get(
      '/api/auth/admin/list-users?searchValue=otto&searchField=email',
    )
    expect(users.status).toBe(HTTP_STATUS.ok)
    expect(userListSchema.parse(await users.json()).users.map((user) => user.email)).toEqual([
      other.email,
    ])
    const denied = await otherClient.get('/api/admin/audit')
    // Otto is an admin now but his session was revoked by the ban; a fresh sign-in works.
    expect([HTTP_STATUS.unauthorized, HTTP_STATUS.ok]).toContain(denied.status)
  })

  it('exposes client errors and health checks to platform admins only', async () => {
    await harness.services.observability.recordClientError({
      message: 'boom',
      source: 'at foo (a.js:1:2)',
      route: '/app/editor',
      userAgent: 'test-agent',
      requestId: 'req-1',
      userId: null,
    })
    await harness.services.observability.recordHealthCheck({
      ok: true,
      detail: null,
      durationMs: 12,
    })

    const otherClient = new TestClient(harness.app, harness.env)
    await otherClient.signUpAndVerify(harness.mailbox, other)
    expect(await statusOf(otherClient.get('/api/admin/client-errors'))).toBe(HTTP_STATUS.forbidden)
    expect(await statusOf(otherClient.get('/api/admin/health'))).toBe(HTTP_STATUS.forbidden)
    expect(
      await statusOf(new TestClient(harness.app, harness.env).get('/api/admin/client-errors')),
    ).toBe(HTTP_STATUS.unauthorized)

    const errors = await adminClient.get('/api/admin/client-errors')
    expect(errors.status).toBe(HTTP_STATUS.ok)
    const { errors: rows } = adminClientErrorListSchema.parse(await errors.json())
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ message: 'boom', route: '/app/editor', requestId: 'req-1' })

    const health = await adminClient.get('/api/admin/health')
    expect(health.status).toBe(HTTP_STATUS.ok)
    const { checks } = adminHealthListSchema.parse(await health.json())
    expect(checks).toHaveLength(1)
    expect(checks[0]).toMatchObject({ ok: true, durationMs: 12 })
  })

  it('publishes the Turnstile site key only when bot protection is configured', async () => {
    // Cloud-import pickers are unconfigured in the default harness, so every
    // picker field is null; only the Turnstile key changes between the cases.
    const noCloudPickers = {
      googleOAuthClientId: null,
      googlePickerApiKey: null,
      googlePickerAppId: null,
      microsoftClientId: null,
      dropboxAppKey: null,
    }
    const off = await new TestClient(harness.app, harness.env).get('/api/config')
    expect(publicConfigSchema.parse(await off.json())).toEqual({
      turnstileSiteKey: null,
      ...noCloudPickers,
    })

    const protectedHarness = createTestHarness({
      captcha: {
        siteKey: 'site-key',
        secretKey: 'secret-key',
        siteVerifyUrl: 'https://verify.test/',
      },
    })
    const on = await new TestClient(protectedHarness.app, protectedHarness.env).get('/api/config')
    expect(publicConfigSchema.parse(await on.json())).toEqual({
      turnstileSiteKey: 'site-key',
      ...noCloudPickers,
    })
  })

  it('publishes each cloud-import key that the deployment has configured', async () => {
    const configured = createTestHarness({
      cloudImport: {
        GOOGLE_OAUTH_CLIENT_ID: 'google-client',
        GOOGLE_PICKER_API_KEY: 'google-key',
        GOOGLE_PICKER_APP_ID: 'google-app',
        MICROSOFT_CLIENT_ID: 'ms-client',
        DROPBOX_APP_KEY: 'dropbox-key',
      },
    })
    const response = await new TestClient(configured.app, configured.env).get('/api/config')
    expect(publicConfigSchema.parse(await response.json())).toEqual({
      turnstileSiteKey: null,
      googleOAuthClientId: 'google-client',
      googlePickerApiKey: 'google-key',
      googlePickerAppId: 'google-app',
      microsoftClientId: 'ms-client',
      dropboxAppKey: 'dropbox-key',
    })
  })
})

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input
  }
  return input instanceof URL ? input.href : input.url
}

describe('Turnstile on sign-up', () => {
  const realFetch = globalThis.fetch
  let verifyCalls: { secret: string; response: string }[] = []

  beforeEach(() => {
    verifyCalls = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input)
        if (url.startsWith('https://verify.test/') && typeof init?.body === 'string') {
          const body = JSON.parse(init.body) as { secret: string; response: string }
          verifyCalls.push(body)
          return Response.json({ success: body.response === 'good-token' })
        }
        return await realFetch(input, init)
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('refuses sign-up without a valid token and passes with one', async () => {
    const protectedHarness = createTestHarness({
      captcha: {
        siteKey: 'site-key',
        secretKey: 'secret-key',
        siteVerifyUrl: 'https://verify.test/',
      },
    })
    const client = new TestClient(protectedHarness.app, protectedHarness.env)
    const missing = await client.post('/api/auth/sign-up/email', other)
    expect(missing.status).toBe(HTTP_STATUS.badRequest)
    const bad = await client.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-captcha-response': 'bad-token' },
      body: JSON.stringify(other),
    })
    expect(bad.status).toBe(HTTP_STATUS.forbidden)
    const good = await client.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-captcha-response': 'good-token' },
      body: JSON.stringify(other),
    })
    expect(good.status).toBe(HTTP_STATUS.ok)
    expect(verifyCalls.map((call) => call.secret)).toEqual(['secret-key', 'secret-key'])

    // Password reset is protected too; sign-in is not.
    const reset = await client.post('/api/auth/request-password-reset', {
      email: other.email,
      redirectTo: '/reset-password',
    })
    expect(reset.status).toBe(HTTP_STATUS.badRequest)
    const signIn = await client.post('/api/auth/sign-in/email', {
      email: other.email,
      password: other.password,
    })
    expect(signIn.status).not.toBe(HTTP_STATUS.badRequest)
  })

  it('is disabled when no keys are configured', async () => {
    const client = new TestClient(harness.app, harness.env)
    const response = await client.post('/api/auth/sign-up/email', other)
    expect(response.status).toBe(HTTP_STATUS.ok)
    expect(verifyCalls).toEqual([])
  })
})
