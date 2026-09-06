/**
 * Runs inside workerd with real D1 and a real R2 bucket binding. Proves the
 * library stores (Drizzle queries, the json_extract reference count, R2 put
 * and get with content-type metadata) against the actual runtime rather than
 * the in-memory doubles used by the Node route tests.
 */
import { env } from 'cloudflare:workers'

import { beforeAll, describe, expect, it } from 'vitest'

import { createApp } from './index'
import { getServices } from './services'
import { assetDtoSchema, watermarkDtoSchema, watermarkListResponseSchema } from '../shared/api'
import { HTTP_STATUS } from '../shared/constants'
import { DEFAULT_STYLE, DEFAULT_TEXT_SPEC } from '../shared/watermark'
import { TestClient } from './test-support/client'

const app = createApp()
const owner = {
  name: 'Lena Library',
  email: 'lena@example.test',
  password: 'a perfectly fine passphrase',
}
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

function mailbox() {
  const { devMailbox } = getServices(env)
  if (devMailbox === undefined) {
    throw new Error('workers tests expect EMAIL_PROVIDER=console')
  }
  return devMailbox
}

describe('library over D1 and R2', () => {
  let client: TestClient
  let organizationId: string

  beforeAll(async () => {
    client = new TestClient(app, env)
    await client.signUpAndVerify(mailbox(), owner)
    organizationId = await client.createOrganization('Library Studio', 'library-studio')
  })

  it('round-trips a preset through the watermark table', async () => {
    const created = await client.post(`/api/orgs/${organizationId}/watermarks`, {
      name: 'D1 preset',
      spec: DEFAULT_TEXT_SPEC,
    })
    expect(created.status).toBe(HTTP_STATUS.created)
    const dto = watermarkDtoSchema.parse(await created.json())

    const rows = await getServices(env).db.query.watermark.findMany()
    expect(rows.map((row) => row.id)).toEqual([dto.id])
    expect(rows[0]?.spec).toEqual(DEFAULT_TEXT_SPEC)

    const listed = await client.get(`/api/orgs/${organizationId}/watermarks`)
    expect(watermarkListResponseSchema.parse(await listed.json()).watermarks).toHaveLength(1)
  })

  it('stores logo bytes in R2 and blocks deletion while a preset references them', async () => {
    const form = new FormData()
    form.append('file', new File([PNG_BYTES], 'mark.png', { type: 'image/png' }))
    form.append('name', 'Mark')
    form.append('width', '10')
    form.append('height', '10')
    const uploaded = await client.request(`/api/orgs/${organizationId}/assets`, {
      method: 'POST',
      body: form,
    })
    expect(uploaded.status).toBe(HTTP_STATUS.created)
    const asset = assetDtoSchema.parse(await uploaded.json())

    const stored = await env.BUCKET.get(`org/${organizationId}/logos/${asset.id}`)
    expect(stored?.httpMetadata?.contentType).toBe('image/png')
    expect(new Uint8Array((await stored?.arrayBuffer()) ?? new ArrayBuffer(0))).toEqual(PNG_BYTES)

    const served = await client.get(`/api/orgs/${organizationId}/assets/${asset.id}/file`)
    expect(served.status).toBe(HTTP_STATUS.ok)
    expect(served.headers.get('content-length')).toBe(String(PNG_BYTES.byteLength))

    const preset = await client.post(`/api/orgs/${organizationId}/watermarks`, {
      name: 'Logo preset',
      spec: {
        kind: 'image',
        assetId: asset.id,
        placement: { mode: 'smart' },
        contrast: { mode: 'auto' },
        style: DEFAULT_STYLE,
      },
    })
    expect(preset.status).toBe(HTTP_STATUS.created)
    const blocked = await client.request(`/api/orgs/${organizationId}/assets/${asset.id}`, {
      method: 'DELETE',
    })
    expect(blocked.status).toBe(HTTP_STATUS.conflict)

    const presetId = watermarkDtoSchema.parse(await preset.json()).id
    await client.request(`/api/orgs/${organizationId}/watermarks/${presetId}`, {
      method: 'DELETE',
    })
    const removed = await client.request(`/api/orgs/${organizationId}/assets/${asset.id}`, {
      method: 'DELETE',
    })
    expect(removed.status).toBe(HTTP_STATUS.noContent)
    expect(await env.BUCKET.get(`org/${organizationId}/logos/${asset.id}`)).toBeNull()
  })
})
