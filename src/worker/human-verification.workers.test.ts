/** Exercise required human admission in workerd with real D1 and Better Auth. */
import { env } from 'cloudflare:workers'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { createApp } from './index'
import { getServices } from './services'
import { HTTP_STATUS } from '../shared/constants'
import { HUMAN_VERIFICATION } from '../shared/human-verification'
import { TestClient } from './test-support/client'
import { responseJson, responseStatus } from './test-support/response'

const protectedEnvironment = {
  ...env,
  TURNSTILE_SITE_KEY: 'workerd-human-fixture-site-key',
  TURNSTILE_SECRET_KEY: 'workerd-human-fixture-secret-key',
}
const providerRequestSchema = z.strictObject({ secret: z.string(), response: z.string() })
const signup = {
  name: 'Workerd Human Fixture',
  email: 'workerd-human@example.test',
  password: 'workerd human fixture passphrase',
}

afterEach(() => vi.unstubAllGlobals())

describe('human verification binding wiring', () => {
  it('requires a fresh admission challenge before D1 account creation and still requires verified email', async () => {
    const consumed = new Set<string>()
    const provider = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      Promise.try(() => {
        expect(input).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
        if (typeof init?.body !== 'string') throw new Error('Expected bounded JSON request')
        const body = providerRequestSchema.parse(JSON.parse(init.body))
        expect(body.secret).toBe(protectedEnvironment.TURNSTILE_SECRET_KEY)
        expect(init.headers).toEqual({ 'content-type': 'application/json' })
        expect(init.redirect).toBe('error')
        const isSuccess =
          body.response === 'valid-workerd-admission' && !consumed.has(body.response)
        consumed.add(body.response)
        return Response.json({
          success: isSuccess,
          hostname: 'localhost',
          action: HUMAN_VERIFICATION.actions.admission,
        })
      }),
    )
    vi.stubGlobal('fetch', provider)
    const services = getServices(protectedEnvironment)
    const mailbox = services.devMailbox
    if (mailbox === undefined) throw new Error('Missing isolated console mailbox')
    const client = new TestClient(createApp(), protectedEnvironment)
    const submit = (token?: string) =>
      client.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'cf-connecting-ip': '203.0.113.171',
          ...(token !== undefined && { 'x-captcha-response': token }),
        },
        body: JSON.stringify(signup),
      })
    expect(await responseStatus(submit())).toBe(HTTP_STATUS.badRequest)
    expect(provider).not.toHaveBeenCalled()
    expect(await responseStatus(submit('forged-workerd-admission'))).toBe(HTTP_STATUS.forbidden)
    expect(await services.db.query.user.findMany()).toHaveLength(0)
    expect(mailbox.messages()).toHaveLength(0)
    expect(await responseStatus(submit('valid-workerd-admission'))).toBe(HTTP_STATUS.ok)
    const users = await services.db.query.user.findMany()
    expect(users).toHaveLength(1)
    expect(users[0]?.email).toBe(signup.email)
    expect(users[0]?.emailVerified).toBe(false)
    expect(mailbox.messages()).toHaveLength(1)
    expect(await responseJson(client.get('/api/auth/get-session'))).toBeNull()
    expect(await responseStatus(client.get('/api/me/recent-view'))).toBe(HTTP_STATUS.unauthorized)
    expect(await responseStatus(submit('valid-workerd-admission'))).toBe(HTTP_STATUS.forbidden)
    expect(await services.db.query.user.findMany()).toHaveLength(1)
    expect(mailbox.messages()).toHaveLength(1)
  })
})
