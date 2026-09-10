import { describe, expect, it } from 'vitest'

import { API_BODY_LIMITS, requestBodyLimit } from './body-limit'
import { MAX_LOGO_BYTES, MAX_PHOTO_BYTES, MAX_THUMBNAIL_BYTES } from '../../shared/constants'
import { signUpOwner, TestClient } from '../test-support/client'
import { createTestHarness } from '../test-support/test-app'

const OWNER = {
  name: 'Bounded Owner',
  email: 'bounded@example.test',
  password: 'a bounded owner passphrase',
}

function oversizedBody() {
  const state = { cancelled: false, reads: 0 }
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      state.reads++
      controller.enqueue(new Uint8Array(API_BODY_LIMITS.json + 1))
    },
    cancel() {
      state.cancelled = true
    },
  })
  return { body, state }
}

function requestStream(
  client: TestClient,
  body: ReadableStream<Uint8Array>,
  {
    path = '/api/auth/sign-up/email',
    contentType = 'application/json',
    declaredLength,
  }: { path?: string; contentType?: string; declaredLength?: string | undefined } = {},
) {
  const init: RequestInit & { duplex: 'half' } = {
    method: path === '/api/me' ? 'PATCH' : 'POST',
    body,
    duplex: 'half',
    headers: {
      'content-type': contentType,
      ...(declaredLength !== undefined && { 'content-length': declaredLength }),
    },
  }
  return client.request(path, init)
}

describe('streaming API request limits', () => {
  it.each([undefined, '1'])(
    'rejects oversized auth JSON with Content-Length=%s before any account creation',
    async (declared) => {
      const harness = createTestHarness()
      const client = new TestClient(harness.app, harness.env)
      const stream = oversizedBody()
      const response = await requestStream(client, stream.body, { declaredLength: declared })
      expect(response.status).toBe(413)
      expect(stream.state.cancelled).toBe(true)
      expect(stream.state.reads).toBeLessThanOrEqual(2)
      const context = await harness.services.auth.$context
      expect(await context.adapter.count({ model: 'user' })).toBe(0)
      expect(harness.mailbox.messages()).toEqual([])
    },
  )
  it.each(['text/plain', 'multipart/form-data; boundary=fixture'])(
    'cannot bypass account limits with a %s label',
    async (contentType) => {
      const harness = createTestHarness()
      const client = new TestClient(harness.app, harness.env)
      const stream = oversizedBody()
      const response = await requestStream(client, stream.body, { contentType })
      expect(response.status).toBe(413)
      expect(stream.state.cancelled).toBe(true)
    },
  )
  it('caps existing JSON handlers without converting an exceeded stream into a generic parse error', async () => {
    const harness = createTestHarness()
    const { client, organizationId } = await signUpOwner(harness, OWNER, {
      name: 'Bounded workspace',
      slug: 'bounded-workspace',
    })
    for (const path of [
      '/api/me',
      `/api/orgs/${organizationId}/watermarks`,
      `/api/orgs/${organizationId}/photos/delete`,
    ]) {
      const stream = oversizedBody()
      const response = await requestStream(client, stream.body, { path, declaredLength: '1' })
      expect(response.status).toBe(413)
      expect(stream.state.cancelled).toBe(true)
    }
  })
  it('keeps valid bounded JSON and separate multipart overhead allowances working', async () => {
    const harness = createTestHarness()
    const { client } = await signUpOwner(harness, OWNER, {
      name: 'Valid workspace',
      slug: 'valid-workspace',
    })
    const response = await client.request('/api/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locale: 'es' }),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ locale: 'es' })
    expect(requestBodyLimit('POST', '/api/orgs/own/assets')).toBe(
      MAX_LOGO_BYTES + API_BODY_LIMITS.multipartOverhead,
    )
    expect(requestBodyLimit('POST', '/api/orgs/own/photos')).toBe(
      MAX_PHOTO_BYTES + MAX_THUMBNAIL_BYTES + API_BODY_LIMITS.multipartOverhead,
    )
    expect(requestBodyLimit('POST', '/api/orgs/own/photos/delete')).toBe(API_BODY_LIMITS.json)
    expect(requestBodyLimit('POST', '/api/auth/sign-up/email')).toBe(API_BODY_LIMITS.json)
  })
  it('rejects an oversized declaration before parsing or creating an account', async () => {
    const harness = createTestHarness()
    const client = new TestClient(harness.app, harness.env)
    const response = await client.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(API_BODY_LIMITS.json + 1),
      },
      body: '{}',
    })
    expect(response.status).toBe(413)
    expect(harness.mailbox.messages()).toEqual([])
  })
  it('fails closed for a broken upstream stream or non-byte stream chunks', async () => {
    const harness = createTestHarness()
    const client = new TestClient(harness.app, harness.env)
    const broken = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('Disconnected request stream'))
      },
    })
    const invalid = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('not bytes')
      },
    })
    // This deliberately malformed fixture violates Fetch's byte-stream contract.
    const invalidBytes = invalid as unknown as ReadableStream<Uint8Array>
    for (const body of [broken, invalidBytes]) {
      const response = await requestStream(client, body)
      expect(response.status).toBe(400)
    }
    const context = await harness.services.auth.$context
    expect(await context.adapter.count({ model: 'user' })).toBe(0)
  })
  it('keeps the size refusal authoritative when cancellation of the source also fails', async () => {
    const harness = createTestHarness()
    const client = new TestClient(harness.app, harness.env)
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(API_BODY_LIMITS.json + 1))
      },
      cancel() {
        throw new Error('Disconnected source during cancellation')
      },
    })
    const response = await requestStream(client, body)
    expect(response.status).toBe(413)
    expect(harness.mailbox.messages()).toEqual([])
  })
})
