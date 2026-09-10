import { afterEach, describe, expect, it, vi } from 'vitest'

import { signUpOwner } from './test-support/client'
import { createTestHarness } from './test-support/test-app'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('request failure privacy', () => {
  it('routes Better Auth adapter failures through sanitized Worker logging instead of Better Call raw errors', async () => {
    const harness = createTestHarness()
    const logger = vi.spyOn(console, 'error').mockImplementation(vi.fn())
    const context = await harness.services.auth.$context
    vi.spyOn(context.adapter, 'findOne').mockRejectedValue(
      new Error('SQL_PARAMS_CANARY user@example.test ACCESS_TOKEN_CANARY'),
    )
    const response = await harness.app.fetch(
      new Request('http://localhost:5273/api/auth/sign-in/email', {
        method: 'POST',
        headers: { origin: 'http://localhost:5273', 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'fixture@example.test', password: 'a fixture passphrase' }),
      }),
      harness.env,
    )
    expect(response.status).toBe(500)
    const logged = JSON.stringify(logger.mock.calls)
    expect(logged).toContain('Request failed')
    for (const sensitive of [
      'SQL_PARAMS_CANARY',
      'ACCESS_TOKEN_CANARY',
      'user@example.test',
      '# SERVER_ERROR',
    ])
      expect(logged).not.toContain(sensitive)
  })
  it('returns a generic failure and records classification without SQL parameters or user data', async () => {
    const harness = createTestHarness()
    const { client, organizationId } = await signUpOwner(
      harness,
      {
        name: 'Fixture owner',
        email: 'fixture@example.test',
        password: 'a fixture owner password',
      },
      { name: 'Fixture workspace', slug: 'fixture-workspace' },
    )
    const logger = vi.spyOn(console, 'error').mockImplementation(vi.fn())
    const failure = Object.assign(
      new Error('SELECT secret FROM account; params: TOKEN_CANARY, person@example.test'),
      {
        token: 'TOKEN_CANARY',
        state: { secret: 'STATE_CANARY' },
        requestBody: { name: 'PRIVATE_NAME_CANARY' },
      },
    )
    vi.spyOn(harness.services.photos, 'list').mockRejectedValue(failure)
    const response = await client.get(`/api/orgs/${organizationId}/photos`)
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'internal_error' })
    const logged = JSON.stringify(logger.mock.calls)
    expect(logged).toContain('Request failed')
    expect(logged).toContain('Error')
    for (const sensitive of [
      'TOKEN_CANARY',
      'STATE_CANARY',
      'PRIVATE_NAME_CANARY',
      'person@example.test',
      'SELECT secret',
    ])
      expect(logged).not.toContain(sensitive)
  })
})
