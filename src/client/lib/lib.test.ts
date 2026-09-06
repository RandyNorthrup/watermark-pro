import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { ApiRequestError, fetchJson } from './api'
import { cn } from './cn'
import { describeAuthError, describeError } from './errors'
import { initialsOf } from './initials'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('initialsOf', () => {
  it('takes the first letter of the first two words', () => {
    expect(initialsOf('Ada Lovelace')).toBe('AL')
    expect(initialsOf('  grace   brewster murray hopper ')).toBe('GB')
    expect(initialsOf('')).toBe('')
  })
})

describe('cn', () => {
  it('merges conditional classes and resolves tailwind conflicts', () => {
    expect(cn('px-2', false, 'px-4', { hidden: true })).toBe('px-4 hidden')
  })
})

describe('describeError', () => {
  it('prefers the message of known errors and falls back otherwise', () => {
    expect(describeError(new ApiRequestError('/x', 500, 'Boom'))).toBe('Boom')
    expect(describeError(new Error('plain'))).toBe('plain')
    const blank = new Error('placeholder')
    blank.message = ''
    expect(describeError(blank)).toBe('Something went wrong. Please try again.')
    expect(describeError('string')).toBe('Something went wrong. Please try again.')
  })

  it('maps Better Auth error objects', () => {
    expect(describeAuthError(null)).toBeNull()
    expect(describeAuthError({ message: 'Nope' })).toBe('Nope')
    expect(describeAuthError({ code: 'X' })).toBe('Something went wrong. Please try again.')
  })
})

describe('fetchJson', () => {
  const schema = z.object({ ok: z.boolean() })

  it('validates a successful payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ ok: true }))),
    )
    await expect(fetchJson('/api/thing', schema)).resolves.toEqual({ ok: true })
  })

  it('throws ApiRequestError with the status on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 403 }))),
    )
    await expect(fetchJson('/api/thing', schema)).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 403,
      path: '/api/thing',
    })
  })

  it('rejects payloads that do not match the schema', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ ok: 'yes' }))),
    )
    await expect(fetchJson('/api/thing', schema)).rejects.toBeInstanceOf(z.ZodError)
  })
})
