import { expect, it } from 'vitest'

import { accountStatsSchema, privateWorkspaceSchema } from '../../shared/api-accounts'
import { findLink, TestClient } from '../test-support/client'
import { responseJson, responseStatus } from '../test-support/response'
import { createTestHarness } from '../test-support/test-app'

it('an operator-created first owner must verify the mailbox and can then choose a password without opening signup', async () => {
  const harness = createTestHarness({ invitationOnly: true })
  const context = await harness.services.auth.$context
  const email = 'self-host-owner@example.test'
  await context.adapter.create({
    model: 'user',
    data: {
      name: 'Self-host Owner',
      email,
      emailVerified: false,
      role: 'admin',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  })
  const client = new TestClient(harness.app, harness.env)
  expect(await responseStatus(client.get('/api/admin/account-stats'))).toBe(401)
  const verification = await client.post('/api/auth/send-verification-email', {
    email,
    callbackURL: '/app',
  })
  expect(verification.status).toBe(200)
  await client.get(findLink(harness.mailbox, email, '/api/auth/verify-email'))
  const stats = accountStatsSchema.parse(await responseJson(client.get('/api/admin/account-stats')))
  expect(stats).toMatchObject({ users: 1, verifiedUsers: 1 })
  const workspace = privateWorkspaceSchema.parse(
    await responseJson(client.post('/api/me/workspace', {})),
  )
  expect(workspace.organizationId).toMatch(/^personal-/)
  await client.post('/api/auth/request-password-reset', { email, redirectTo: '/reset-password' })
  const resetLink = findLink(harness.mailbox, email, '/reset-password')
  const redirect = await client.get(resetLink)
  const token = new URL(
    redirect.headers.get('location') ?? '',
    'http://localhost:5273',
  ).searchParams.get('token')
  expect(token).not.toBeNull()
  const password = 'a self-hosted secure passphrase'
  expect(
    await responseStatus(client.post('/api/auth/reset-password', { token, newPassword: password })),
  ).toBe(200)
  await client.post('/api/auth/sign-out', {})
  expect(await responseStatus(client.post('/api/auth/sign-in/email', { email, password }))).toBe(
    200,
  )
  expect(
    await responseStatus(
      client.post('/api/auth/sign-up/email', {
        email: 'uninvited@example.test',
        name: 'Uninvited',
        password,
      }),
    ),
  ).toBe(403)
})
