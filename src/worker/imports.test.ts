/* eslint-disable unicorn/prefer-https -- these tests deliberately use http:// URLs to prove the policy refuses them */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { errorCodeOf, joinAsMember, signUpOwner, type TestClient } from './test-support/client'
import { createTestHarness, type TestHarness } from './test-support/test-app'
import { API_ERROR_CODE, HTTP_STATUS, MAX_PHOTO_BYTES } from '../shared/constants'

const owner = { name: 'Ida Import', email: 'ida@example.test', password: 'correct horse battery' }
const viewer = { name: 'Vic Viewer', email: 'vic@example.test', password: 'viewers long password' }

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const TEXT_BYTES = new TextEncoder().encode('this is not an image at all!')

let harness: TestHarness
let ownerClient: TestClient
let organizationId: string
const fetchMock = vi.fn<typeof fetch>()

function imageResponse(bytes: Uint8Array, headers: Record<string, string> = {}): Response {
  return new Response(bytes, { status: HTTP_STATUS.ok, headers })
}

function redirectTo(location: string): Response {
  return new Response(null, { status: HTTP_STATUS.found, headers: { location } })
}

/** A body that streams `chunks` chunks of `chunkSize` bytes, to exercise the streamed size cap. */
function streamResponse(chunks: number, chunkSize: number): Response {
  let sent = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= chunks) {
        controller.close()
        return
      }
      sent += 1
      controller.enqueue(new Uint8Array(chunkSize))
    },
  })
  return new Response(body, { status: HTTP_STATUS.ok })
}

async function importUrl(client: TestClient, url: string): Promise<Response> {
  return await client.request(`/api/orgs/${organizationId}/imports/url`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  })
}

beforeEach(async () => {
  harness = createTestHarness()
  ;({ client: ownerClient, organizationId } = await signUpOwner(harness, owner, {
    name: 'Import Studio',
    slug: 'import-studio',
  }))
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('import from a URL', () => {
  it('fetches a public https image, sniffs it, and returns the bytes', async () => {
    fetchMock.mockResolvedValue(imageResponse(PNG_BYTES))
    const response = await importUrl(ownerClient, 'https://cdn.example.com/photo.png')
    expect(response.status).toBe(HTTP_STATUS.ok)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG_BYTES)
  })

  it.each([
    ['a non-https link', 'http://cdn.example.com/a.png'],
    ['an IP literal', 'https://127.0.0.1/a.png'],
    ['localhost', 'https://localhost/a.png'],
  ])('refuses %s without fetching', async (_label, url) => {
    const response = await importUrl(ownerClient, url)
    expect(response.status).toBe(HTTP_STATUS.badRequest)
    expect(await errorCodeOf(response)).toBe(API_ERROR_CODE.unsupportedUrl)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('re-checks each redirect hop against the policy', async () => {
    // Were the hop not re-checked, this metadata endpoint would be fetched and
    // served (the second response); the policy must refuse it first.
    fetchMock
      .mockResolvedValueOnce(redirectTo('http://169.254.169.254/latest/meta-data'))
      .mockResolvedValueOnce(imageResponse(PNG_BYTES))
    const response = await importUrl(ownerClient, 'https://cdn.example.com/a.png')
    expect(response.status).toBe(HTTP_STATUS.badRequest)
    expect(await errorCodeOf(response)).toBe(API_ERROR_CODE.unsupportedUrl)
  })

  it('follows an allowed redirect to another public host', async () => {
    fetchMock
      .mockResolvedValueOnce(redirectTo('https://images.example.net/real.png'))
      .mockResolvedValueOnce(imageResponse(PNG_BYTES))
    const response = await importUrl(ownerClient, 'https://cdn.example.com/a.png')
    expect(response.status).toBe(HTTP_STATUS.ok)
  })

  it('rejects a body larger than the cap by its declared length', async () => {
    fetchMock.mockResolvedValue(
      imageResponse(PNG_BYTES, { 'content-length': String(MAX_PHOTO_BYTES + 1) }),
    )
    const response = await importUrl(ownerClient, 'https://cdn.example.com/big.png')
    expect(response.status).toBe(HTTP_STATUS.payloadTooLarge)
  })

  it('rejects a body larger than the cap while streaming', async () => {
    const chunkSize = 4 * 1024 * 1024
    fetchMock.mockResolvedValue(
      streamResponse(Math.ceil(MAX_PHOTO_BYTES / chunkSize) + 1, chunkSize),
    )
    const response = await importUrl(ownerClient, 'https://cdn.example.com/streamed.png')
    expect(response.status).toBe(HTTP_STATUS.payloadTooLarge)
  })

  it('rejects bytes that are not a supported image', async () => {
    fetchMock.mockResolvedValue(imageResponse(TEXT_BYTES))
    const response = await importUrl(ownerClient, 'https://cdn.example.com/notes.txt')
    expect(response.status).toBe(HTTP_STATUS.unsupportedMediaType)
  })

  it('reports a fetch failure as an unsupported link, not a fault', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    const response = await importUrl(ownerClient, 'https://cdn.example.com/a.png')
    expect(response.status).toBe(HTTP_STATUS.badRequest)
    expect(await errorCodeOf(response)).toBe(API_ERROR_CODE.unsupportedUrl)
  })

  it('forbids a viewer from importing', async () => {
    const viewerClient = await joinAsMember(harness, ownerClient, organizationId, viewer, 'viewer')
    const response = await importUrl(viewerClient, 'https://cdn.example.com/a.png')
    expect(response.status).toBe(HTTP_STATUS.forbidden)
  })

  it('rate limits repeated imports from one address', async () => {
    harness = createTestHarness({ importLimiter: () => Promise.resolve(false) })
    ;({ client: ownerClient, organizationId } = await signUpOwner(harness, owner, {
      name: 'Import Studio',
      slug: 'import-studio',
    }))
    const response = await importUrl(ownerClient, 'https://cdn.example.com/a.png')
    expect(response.status).toBe(HTTP_STATUS.tooManyRequests)
  })
})
