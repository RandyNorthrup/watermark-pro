import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { HTTP_STATUS } from '../../shared/constants'
import { HUMAN_VERIFICATION } from '../../shared/human-verification'
import { findLink, TestClient } from '../test-support/client'
import { responseJson, responseStatus } from '../test-support/response'
import { createTestHarness } from '../test-support/test-app'

const signup = {
  name: 'Human Verification Fixture',
  email: 'verified-human@example.test',
  password: 'human verification fixture passphrase',
}
const providerRequestSchema = z.strictObject({ secret: z.string(), response: z.string() })
const verificationUrl = 'https://verify.example.test/'
const configuration = {
  siteKey: 'fixture-site-key',
  secretKey: 'fixture-secret-key',
  siteVerifyUrl: verificationUrl,
}

let consumed: Set<string>
let verifyCalls: string[]

function verifyFixture(input: RequestInfo | URL, init?: RequestInit): Response {
  let url: string
  if (typeof input === 'string') url = input
  else if (input instanceof URL) url = input.href
  else url = input.url
  if (url !== verificationUrl) throw new Error('Unexpected network request in human fixture')
  if (typeof init?.body !== 'string') throw new Error('Expected a JSON provider request')
  const body = providerRequestSchema.parse(JSON.parse(init.body))
  expect(init.redirect).toBe('error')
  expect(init.method).toBe('POST')
  expect(init.headers).toEqual({ 'content-type': 'application/json' })
  expect(init.signal).toBeInstanceOf(AbortSignal)
  expect(body.secret).toBe(configuration.secretKey)
  verifyCalls.push(body.response)
  if (body.response === 'provider-failure') throw new Error('Provider unavailable')
  if (body.response === 'malformed-response') return Response.json({})
  if (body.response === 'truthy-success')
    return Response.json({
      success: 'true',
      hostname: 'localhost',
      action: HUMAN_VERIFICATION.actions.admission,
    })
  if (body.response === 'provider-refusal')
    return Response.json({ error: 'fixture' }, { status: 503 })
  if (body.response === 'malformed-json') return new Response('not json')
  if (body.response === 'oversized-response')
    return Response.json(
      {
        success: true,
        hostname: 'localhost',
        action: HUMAN_VERIFICATION.actions.admission,
        fixturePadding: 'x'.repeat(16_384),
      },
      { headers: { 'content-length': '1' } },
    )
  const isConsumed = consumed.has(body.response)
  consumed.add(body.response)
  let action: string = HUMAN_VERIFICATION.actions.admission
  if (body.response === 'valid-recovery') action = HUMAN_VERIFICATION.actions.recovery
  else if (body.response === 'wrong-action') action = 'another_form'
  return Response.json({
    success: !isConsumed && body.response !== 'forged' && body.response !== 'expired',
    hostname: body.response === 'wrong-host' ? 'outside.example.test' : 'localhost',
    action,
    'error-codes': isConsumed ? ['timeout-or-duplicate'] : [],
  })
}

beforeEach(() => {
  consumed = new Set()
  verifyCalls = []
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      Promise.try(() => verifyFixture(input, init)),
    ),
  )
})

afterEach(() => vi.unstubAllGlobals())

function protectedClient() {
  const harness = createTestHarness({
    captcha: configuration,
    accountOAuth: { google: { clientId: 'fixture-google', clientSecret: 'fixture-google-secret' } },
  })
  return { harness, client: new TestClient(harness.app, harness.env) }
}

async function submit(client: TestClient, token: string | undefined, path = '/sign-up/email') {
  return await client.request(`/api/auth${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token !== undefined && { 'x-captcha-response': token }),
    },
    body: JSON.stringify(signup),
  })
}

describe('server human verification', () => {
  it.each(['deadline', 'client-cancelled'] as const)(
    'fails closed and cancels the provider request on %s without logging private input',
    async (reason) => {
      const { client, harness } = protectedClient()
      const deadline = new AbortController()
      const incoming = new AbortController()
      const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal)
      const provider = vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal
            if (signal == null) throw new Error('Missing provider cancellation signal')
            signal.addEventListener('abort', () => reject(new Error('Provider request aborted')), {
              once: true,
            })
          }),
      )
      vi.stubGlobal('fetch', provider)
      const errorLog = vi.spyOn(console, 'error')
      const warnLog = vi.spyOn(console, 'warn')
      const response = client.request('/api/auth/sign-up/email', {
        method: 'POST',
        signal: incoming.signal,
        headers: {
          'content-type': 'application/json',
          'x-captcha-response': 'private-token-canary',
        },
        body: JSON.stringify(signup),
      })
      await vi.waitFor(() => expect(provider).toHaveBeenCalledOnce())
      expect(timeout).toHaveBeenCalledWith(10_000)
      const abort = reason === 'deadline' ? deadline : incoming
      abort.abort(new Error('private-provider-canary'))
      const result = await response
      expect(result.status).toBe(HTTP_STATUS.internalServerError)
      expect(await result.json()).toEqual({
        code: 'UNKNOWN_ERROR',
        message: 'Human verification is unavailable.',
      })
      expect(harness.mailbox.messages()).toHaveLength(0)
      expect(errorLog).not.toHaveBeenCalled()
      expect(warnLog).not.toHaveBeenCalled()
      timeout.mockRestore()
      errorLog.mockRestore()
      warnLog.mockRestore()
    },
  )

  it.each([undefined, '', 'x'.repeat(HUMAN_VERIFICATION.maxTokenCharacters + 1)])(
    'refuses an absent, empty or oversized token before contacting the provider: %j',
    async (token) => {
      const { client, harness } = protectedClient()
      expect(await responseStatus(submit(client, token))).toBe(HTTP_STATUS.badRequest)
      expect(verifyCalls).toEqual([])
      expect(harness.mailbox.messages()).toHaveLength(0)
    },
  )

  it.each([
    'forged',
    'expired',
    'wrong-host',
    'wrong-action',
    'malformed-response',
    'truthy-success',
  ])('refuses %s without creating or emailing an account', async (token) => {
    const { client, harness } = protectedClient()
    expect(await responseStatus(submit(client, token))).toBe(HTTP_STATUS.forbidden)
    expect(harness.mailbox.messages()).toHaveLength(0)
    expect(await responseJson(client.get('/api/auth/get-session'))).toBeNull()
  })

  it('accepts a bound challenge once, but email verification remains required and replay fails', async () => {
    const { client, harness } = protectedClient()
    expect(await responseStatus(submit(client, 'valid-admission'))).toBe(HTTP_STATUS.ok)
    expect(harness.mailbox.messages()).toHaveLength(1)
    expect(await responseJson(client.get('/api/auth/get-session'))).toBeNull()
    expect(await responseStatus(submit(client, 'fresh-signin', '/sign-in/email'))).toBe(
      HTTP_STATUS.forbidden,
    )
    const messagesBeforeReplay = harness.mailbox.messages().length
    expect(await responseStatus(submit(client, 'valid-admission'))).toBe(HTTP_STATUS.forbidden)
    expect(harness.mailbox.messages()).toHaveLength(messagesBeforeReplay)
  })

  it.each(['provider-failure', 'provider-refusal', 'malformed-json', 'oversized-response'])(
    'fails closed when verification returns %s',
    async (token) => {
      const { client, harness } = protectedClient()
      expect(await responseStatus(submit(client, token))).toBe(HTTP_STATUS.internalServerError)
      expect(harness.mailbox.messages()).toHaveLength(0)
    },
  )

  it('allows password sign-in only after both a fresh bound challenge and verified email', async () => {
    const { client, harness } = protectedClient()
    expect(await responseStatus(submit(client, 'signup-for-signin'))).toBe(HTTP_STATUS.ok)
    const link = findLink(harness.mailbox, signup.email, '/api/auth/verify-email')
    expect(await responseStatus(client.get(link))).toBeLessThan(HTTP_STATUS.badRequest)
    expect(await responseStatus(client.post('/api/auth/sign-out', {}))).toBe(HTTP_STATUS.ok)
    expect(await responseStatus(submit(client, undefined, '/sign-in/email'))).toBe(
      HTTP_STATUS.badRequest,
    )
    expect(await responseJson(client.get('/api/auth/get-session'))).toBeNull()
    expect(
      await responseStatus(submit(client, 'signin-with-verified-email', '/sign-in/email')),
    ).toBe(HTTP_STATUS.ok)
    const session = z
      .object({
        session: z.object({ id: z.string() }),
        user: z.object({ emailVerified: z.boolean() }),
      })
      .parse(await responseJson(client.get('/api/auth/get-session')))
    expect(session.user.emailVerified).toBe(true)
    expect(
      await responseStatus(submit(client, 'signin-with-verified-email', '/sign-in/email')),
    ).toBe(HTTP_STATUS.forbidden)
    const remaining = z
      .object({ session: z.object({ id: z.string() }) })
      .parse(await responseJson(client.get('/api/auth/get-session')))
    expect(remaining.session.id).toBe(session.session.id)
  })

  it.each(['/sign-in/email', '/send-verification-email'])(
    'protects direct %s requests before credentials or email delivery are processed',
    async (path) => {
      const { client, harness } = protectedClient()
      expect(await responseStatus(submit(client, undefined, path))).toBe(HTTP_STATUS.badRequest)
      expect(await responseStatus(submit(client, 'wrong-action', path))).toBe(HTTP_STATUS.forbidden)
      expect(verifyCalls).toEqual(['wrong-action'])
      expect(harness.mailbox.messages()).toHaveLength(0)
    },
  )

  it('protects normalized endpoint aliases as well as the usual signup path', async () => {
    const { client } = protectedClient()
    expect(await responseStatus(submit(client, undefined, '/sign-up/email/'))).toBe(
      HTTP_STATUS.badRequest,
    )
    expect(await responseStatus(submit(client, 'wrong-host', '//sign-up/email'))).toBe(
      HTTP_STATUS.forbidden,
    )
    expect(verifyCalls).toEqual(['wrong-host'])
  })

  it('uses a distinct recovery action and gives no email-address existence signal', async () => {
    const { client, harness } = protectedClient()
    const reset = async (token: string) =>
      await client.request('/api/auth/request-password-reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-captcha-response': token },
        body: JSON.stringify({ email: signup.email, redirectTo: '/reset-password' }),
      })
    expect(await responseStatus(reset('valid-admission'))).toBe(HTTP_STATUS.forbidden)
    expect(await responseStatus(reset('valid-recovery'))).toBe(HTTP_STATUS.ok)
    expect(harness.mailbox.messages()).toHaveLength(0)
  })

  it('refuses direct OAuth entry without a challenge and admits a verified entry request', async () => {
    const { client, harness } = protectedClient()
    const start = async (token?: string) =>
      await client.request('/api/auth/sign-in/social', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token !== undefined && { 'x-captcha-response': token }),
        },
        body: JSON.stringify({ provider: 'google', callbackURL: '/app', disableRedirect: true }),
      })
    expect(await responseStatus(start())).toBe(HTTP_STATUS.badRequest)
    expect(await responseStatus(start('wrong-action'))).toBe(HTTP_STATUS.forbidden)
    expect(await responseStatus(start('valid-admission'))).toBe(HTTP_STATUS.ok)
    expect(harness.mailbox.messages()).toHaveLength(0)
    expect(await responseJson(client.get('/api/auth/get-session'))).toBeNull()
  })
})
