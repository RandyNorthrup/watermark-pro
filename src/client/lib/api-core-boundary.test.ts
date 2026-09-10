import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from './query-client'
import { NO_CLOUD_CONFIG } from '../test-support/cloud-config'
import { installFakeAuth } from '../test-support/fake-auth-module'

// Core transport and shell queries must not initialize unrelated media/admin schemas.
vi.mock('../../shared/api', () => {
  throw new Error('Unrelated feature schemas evaluated during core API startup.')
})
vi.mock('./auth-client', () => import('../test-support/fake-auth-module'))

beforeEach(() => {
  installFakeAuth()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('core API schema boundary', () => {
  it('validates known errors and rejects arbitrary codes without loading feature schemas', async () => {
    const { toRequestError } = await import('./api')
    const known = await toRequestError(
      '/api/config',
      Response.json({ error: 'forbidden' }, { status: 403 }),
    )
    expect(known).toMatchObject({
      code: 'forbidden',
      status: 403,
      message: 'Your role does not allow this.',
    })
    const unknown = await toRequestError(
      '/api/config',
      Response.json({ error: 'untrusted message' }, { status: 503 }),
    )
    expect(unknown).toMatchObject({ code: null, status: 503 })
    expect(unknown.message).not.toContain('untrusted message')
  })

  it('retains optional provider defaults in validated public configuration', async () => {
    const { publicConfigQueryOptions } = await import('./queries')
    const queryClient = createQueryClient()
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json({
            ...NO_CLOUD_CONFIG,
            googleAuthEnabled: undefined,
            microsoftAuthEnabled: undefined,
          }),
        ),
      ),
    )
    try {
      await expect(queryClient.query(publicConfigQueryOptions)).resolves.toEqual(NO_CLOUD_CONFIG)
    } finally {
      queryClient.clear()
    }
  })

  it.each([
    {},
    { ...NO_CLOUD_CONFIG, googleAuthEnabled: 'yes' },
    { ...NO_CLOUD_CONFIG, googlePickerApiKey: ['invalid'] },
  ])('rejects malformed public configuration at the response boundary', async (body) => {
    const { publicConfigQueryOptions } = await import('./queries')
    const queryClient = createQueryClient()
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json(body))),
    )
    try {
      await expect(queryClient.query(publicConfigQueryOptions)).rejects.toThrow()
      expect(queryClient.getQueryData(publicConfigQueryOptions.queryKey)).toBeUndefined()
    } finally {
      queryClient.clear()
    }
  })

  it('retains audit fields while rejecting malformed identifiers and timestamps', async () => {
    const { auditListResponseSchema } = await import('../../shared/api-core')
    const entry = {
      id: 'event-1',
      organizationId: 'organization-1',
      actorUserId: 'user-1',
      actorName: 'Account',
      action: 'watermark.created',
      targetType: 'watermark',
      targetId: 'preset-1',
      metadata: { name: 'Studio signature' },
      createdAt: '2026-09-10T00:00:00.000Z',
    }
    expect(auditListResponseSchema.parse({ entries: [entry] })).toEqual({ entries: [entry] })
    expect(auditListResponseSchema.safeParse({ entries: [{ ...entry, id: 1 }] }).success).toBe(
      false,
    )
    expect(
      auditListResponseSchema.safeParse({ entries: [{ ...entry, createdAt: 'today' }] }).success,
    ).toBe(false)
  })
})
