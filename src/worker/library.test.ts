import { beforeEach, describe, expect, it } from 'vitest'

import { API_BODY_LIMITS } from './middleware/body-limit'
import { errorCodeOf, joinAsMember, signUpOwner, TestClient } from './test-support/client'
import { createTestHarness, type TestHarness } from './test-support/test-app'
import { ACCOUNT_ID_HEADER } from '../shared/account-identity'
import { assetDtoSchema, assetListResponseSchema } from '../shared/api'
import { watermarkDtoSchema, watermarkListResponseSchema } from '../shared/api-watermark'
import {
  API_ERROR_CODE,
  HTTP_STATUS,
  MAX_LOGO_BYTES,
  MAX_LOGOS_PER_ORGANIZATION,
} from '../shared/constants'
import { shellSessionSchema } from '../shared/shell-cache'
import { SYNC_OPERATION_HEADER } from '../shared/sync'
import { DEFAULT_STYLE, DEFAULT_TEXT_SPEC, type WatermarkSpec } from '../shared/watermark'

const owner = {
  name: 'Olivia Owner',
  email: 'olivia@example.test',
  password: 'correct horse battery',
}
const viewer = {
  name: 'Vera Viewer',
  email: 'vera@example.test',
  password: 'viewers long password',
}
const outsider = {
  name: 'Oscar Outsider',
  email: 'oscar@example.test',
  password: 'outsiders long password',
}

/** Smallest valid PNG signature followed by padding; the route only sniffs the prefix. */
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const GIF_BYTES = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0])
const TEXT_BYTES = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')

let harness: TestHarness
let ownerClient: TestClient
let organizationId: string
let ownerId: string

function base(path = ''): string {
  return `/api/orgs/${organizationId}${path}`
}

function logoForm(bytes: Uint8Array, name = 'logo.png'): FormData {
  const form = new FormData()
  form.append('file', new File([bytes], name, { type: 'image/png' }))
  form.append('name', 'Brand mark')
  form.append('width', '64')
  form.append('height', '32')
  return form
}

async function upload(client: TestClient, form: FormData): Promise<Response> {
  return await client.request(base('/assets'), { method: 'POST', body: form })
}

function inviteAndJoin(user: typeof viewer, role: string): Promise<TestClient> {
  return joinAsMember(harness, ownerClient, organizationId, user, role)
}

async function getStatus(client: TestClient, path: string): Promise<number> {
  const response = await client.get(base(path))
  return response.status
}

async function uploadStatus(client: TestClient): Promise<number> {
  const response = await upload(client, logoForm(PNG_BYTES))
  return response.status
}

beforeEach(async () => {
  harness = createTestHarness()
  ;({ client: ownerClient, organizationId } = await signUpOwner(harness, owner, {
    name: 'Acme Studio',
    slug: 'acme-studio',
  }))
  const session = await ownerClient.get('/api/auth/get-session')
  ownerId = shellSessionSchema.parse(await session.json()).user.id
})

describe('watermark presets', () => {
  it('acknowledges a logo replay and rejects reuse with different bytes', async () => {
    const id = crypto.randomUUID()
    const send = (bytes: Uint8Array) =>
      ownerClient.request(base('/assets'), {
        method: 'POST',
        headers: { [SYNC_OPERATION_HEADER]: id, [ACCOUNT_ID_HEADER]: ownerId },
        body: logoForm(bytes),
      })
    const initial = await send(PNG_BYTES)
    expect(initial.status).toBe(HTTP_STATUS.created)
    const replay = await send(PNG_BYTES)
    expect(replay.status).toBe(HTTP_STATUS.ok)
    expect(assetDtoSchema.parse(await replay.json()).id).toBe(id)
    const changed = await send(new Uint8Array([...PNG_BYTES, 1]))
    expect(changed.status).toBe(HTTP_STATUS.conflict)
    expect(await harness.services.assets.countForOrganization(organizationId, 'logo')).toBe(1)
    const entries = await harness.audit.listForOrganization(organizationId)
    expect(entries.filter((entry) => entry.action === 'asset.uploaded')).toHaveLength(1)
  })
  it('acknowledges a replay once and rejects an operation reused with different content', async () => {
    const operationId = crypto.randomUUID()
    const save = (name: string) =>
      ownerClient.request(base('/watermarks'), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [SYNC_OPERATION_HEADER]: operationId,
          [ACCOUNT_ID_HEADER]: ownerId,
        },
        body: JSON.stringify({ name, spec: DEFAULT_TEXT_SPEC }),
      })
    const firstSave = await save('Offline preset')
    expect(firstSave.status).toBe(HTTP_STATUS.created)
    const replay = await save('Offline preset')
    expect(replay.status).toBe(HTTP_STATUS.ok)
    expect(watermarkDtoSchema.parse(await replay.json()).id).toBe(operationId)
    const changedReplay = await save('Changed replay')
    expect(changedReplay.status).toBe(HTTP_STATUS.conflict)
    const listed = await ownerClient.get(base('/watermarks'))
    expect(
      watermarkListResponseSchema.parse(await listed.json()).watermarks.map((item) => item.name),
    ).toEqual(['Offline preset'])
    const entries = await harness.audit.listForOrganization(organizationId)
    expect(entries.filter((entry) => entry.action === 'watermark.created')).toHaveLength(1)
  })

  it('rejects stale preset edits and acknowledges the same completed edit without overwriting again', async () => {
    const response = await ownerClient.post(base('/watermarks'), {
      name: 'Original',
      spec: DEFAULT_TEXT_SPEC,
    })
    const original = watermarkDtoSchema.parse(await response.json())
    const edit = (name: string) =>
      ownerClient.request(base(`/watermarks/${original.id}`), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          spec: DEFAULT_TEXT_SPEC,
          expectedUpdatedAt: original.updatedAt,
        }),
      })
    const firstEdit = await edit('First edit')
    expect(firstEdit.status).toBe(HTTP_STATUS.ok)
    const retriedEdit = await edit('First edit')
    expect(retriedEdit.status).toBe(HTTP_STATUS.ok)
    const staleEdit = await edit('Stale edit')
    expect(staleEdit.status).toBe(HTTP_STATUS.conflict)
    const listed = await ownerClient.get(base('/watermarks'))
    expect(watermarkListResponseSchema.parse(await listed.json()).watermarks[0]?.name).toBe(
      'First edit',
    )
  })

  it('rejects malformed synchronization identities', async () => {
    const response = await ownerClient.request(base('/watermarks'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [SYNC_OPERATION_HEADER]: '../other-workspace',
        [ACCOUNT_ID_HEADER]: ownerId,
      },
      body: JSON.stringify({ name: 'Rejected', spec: DEFAULT_TEXT_SPEC }),
    })
    expect(response.status).toBe(HTTP_STATUS.badRequest)
  })
  it('creates, lists, updates and deletes a preset with an audit trail', async () => {
    const created = await ownerClient.post(base('/watermarks'), {
      name: 'Default text',
      spec: DEFAULT_TEXT_SPEC,
    })
    expect(created.status).toBe(HTTP_STATUS.created)
    const dto = watermarkDtoSchema.parse(await created.json())
    expect(dto.spec).toEqual(DEFAULT_TEXT_SPEC)
    expect(dto.organizationId).toBe(organizationId)

    const listed = await ownerClient.get(base('/watermarks'))
    expect(watermarkListResponseSchema.parse(await listed.json()).watermarks).toHaveLength(1)

    const renamed = await ownerClient.request(base(`/watermarks/${dto.id}`), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed', spec: DEFAULT_TEXT_SPEC }),
    })
    expect(renamed.status).toBe(HTTP_STATUS.ok)
    expect(watermarkDtoSchema.parse(await renamed.json()).name).toBe('Renamed')

    const removed = await ownerClient.request(base(`/watermarks/${dto.id}`), { method: 'DELETE' })
    expect(removed.status).toBe(HTTP_STATUS.noContent)
    const missing = await ownerClient.request(base(`/watermarks/${dto.id}`), { method: 'DELETE' })
    expect(missing.status).toBe(HTTP_STATUS.notFound)

    const records = await harness.audit.listForOrganization(organizationId)
    const actions = records.map((record) => record.action)
    expect(actions).toEqual(
      expect.arrayContaining(['watermark.created', 'watermark.updated', 'watermark.deleted']),
    )
  })

  it('rejects malformed bodies and specs', async () => {
    const notJson = await ownerClient.request(base('/watermarks'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    })
    expect(notJson.status).toBe(HTTP_STATUS.badRequest)

    const badSpec = await ownerClient.post(base('/watermarks'), {
      name: 'Broken',
      spec: { ...DEFAULT_TEXT_SPEC, style: { ...DEFAULT_STYLE, opacity: 7 } },
    })
    expect(badSpec.status).toBe(HTTP_STATUS.badRequest)
    expect(await errorCodeOf(badSpec)).toBe(API_ERROR_CODE.validation)

    const emptyName = await ownerClient.post(base('/watermarks'), {
      name: ' '.repeat(3),
      spec: DEFAULT_TEXT_SPEC,
    })
    expect(emptyName.status).toBe(HTTP_STATUS.badRequest)
  })

  it('refuses image presets that point at logos the organization does not own', async () => {
    const spec: WatermarkSpec = {
      kind: 'image',
      assetId: 'not-ours',
      placement: { mode: 'smart' },
      contrast: { mode: 'auto' },
      style: DEFAULT_STYLE,
    }
    const response = await ownerClient.post(base('/watermarks'), { name: 'Logo', spec })
    expect(response.status).toBe(HTTP_STATUS.badRequest)
  })

  it('returns 404 when updating a preset that does not exist', async () => {
    const response = await ownerClient.request(base('/watermarks/nope'), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'x', spec: DEFAULT_TEXT_SPEC }),
    })
    expect(response.status).toBe(HTTP_STATUS.notFound)
  })
})

describe('logo assets', () => {
  it('stores a sniffed image, serves it back, and refuses to delete it while referenced', async () => {
    const uploaded = await upload(ownerClient, logoForm(PNG_BYTES, 'anything.bin'))
    expect(uploaded.status).toBe(HTTP_STATUS.created)
    const asset = assetDtoSchema.parse(await uploaded.json())
    expect(asset.contentType).toBe('image/png')
    expect(asset.size).toBe(PNG_BYTES.byteLength)
    expect(asset.width).toBe(64)
    expect(harness.objects.keys()).toEqual([
      expect.stringMatching(
        new RegExp(`^org/${organizationId}/logos/${asset.id}/[a-f0-9-]{36}/[a-f0-9]{64}$`),
      ),
    ])

    const listed = await ownerClient.get(base('/assets'))
    expect(assetListResponseSchema.parse(await listed.json()).assets).toHaveLength(1)

    const file = await ownerClient.get(base(`/assets/${asset.id}/file`))
    expect(file.status).toBe(HTTP_STATUS.ok)
    expect(file.headers.get('content-type')).toBe('image/png')
    expect(file.headers.get('cache-control')).toBe('private, no-store')
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(PNG_BYTES)

    const spec: WatermarkSpec = {
      kind: 'image',
      assetId: asset.id,
      placement: { mode: 'smart' },
      contrast: { mode: 'auto' },
      style: DEFAULT_STYLE,
    }
    const preset = await ownerClient.post(base('/watermarks'), { name: 'Logo', spec })
    expect(preset.status).toBe(HTTP_STATUS.created)

    const blocked = await ownerClient.request(base(`/assets/${asset.id}`), { method: 'DELETE' })
    expect(blocked.status).toBe(HTTP_STATUS.conflict)
    expect(await errorCodeOf(blocked)).toBe(API_ERROR_CODE.conflict)

    const presetId = watermarkDtoSchema.parse(await preset.json()).id
    await ownerClient.request(base(`/watermarks/${presetId}`), { method: 'DELETE' })
    const removed = await ownerClient.request(base(`/assets/${asset.id}`), { method: 'DELETE' })
    expect(removed.status).toBe(HTTP_STATUS.noContent)
    expect(harness.objects.keys()).toEqual([])
    const gone = await ownerClient.get(base(`/assets/${asset.id}/file`))
    expect(gone.status).toBe(HTTP_STATUS.notFound)
  })

  it('rejects non-image bytes and unsupported image types regardless of declared type', async () => {
    const svg = await upload(ownerClient, logoForm(TEXT_BYTES, 'logo.png'))
    expect(svg.status).toBe(HTTP_STATUS.unsupportedMediaType)
    const gif = await upload(ownerClient, logoForm(GIF_BYTES, 'logo.png'))
    expect(gif.status).toBe(HTTP_STATUS.unsupportedMediaType)
    expect(harness.objects.keys()).toEqual([])
  })

  it('rejects oversized files and malformed forms', async () => {
    const declared = await ownerClient.request(base('/assets'), {
      method: 'POST',
      headers: { 'content-length': String(MAX_LOGO_BYTES + API_BODY_LIMITS.multipartOverhead + 1) },
      body: logoForm(PNG_BYTES),
    })
    expect(declared.status).toBe(HTTP_STATUS.payloadTooLarge)

    const big = new Uint8Array(MAX_LOGO_BYTES + 1)
    big.set(PNG_BYTES)
    const oversized = await upload(ownerClient, logoForm(big))
    expect(oversized.status).toBe(HTTP_STATUS.payloadTooLarge)

    const noFile = new FormData()
    noFile.append('name', 'x')
    const missing = await upload(ownerClient, noFile)
    expect(missing.status).toBe(HTTP_STATUS.badRequest)

    const notMultipart = await ownerClient.post(base('/assets'), { file: 'nope' })
    expect(notMultipart.status).toBe(HTTP_STATUS.badRequest)

    const badDimensions = logoForm(PNG_BYTES)
    badDimensions.set('width', '-3')
    const dimensions = await upload(ownerClient, badDimensions)
    expect(dimensions.status).toBe(HTTP_STATUS.badRequest)
  })

  it('caps the number of logos per organization', async () => {
    for (let index = 0; index < MAX_LOGOS_PER_ORGANIZATION; index += 1) {
      const response = await upload(ownerClient, logoForm(PNG_BYTES))
      expect(response.status).toBe(HTTP_STATUS.created)
    }
    const overflow = await upload(ownerClient, logoForm(PNG_BYTES))
    expect(overflow.status).toBe(HTTP_STATUS.badRequest)
    expect(await errorCodeOf(overflow)).toBe(API_ERROR_CODE.quotaExceeded)
  })

  it('returns 404 for unknown assets', async () => {
    const file = await ownerClient.get(base('/assets/nope/file'))
    expect(file.status).toBe(HTTP_STATUS.notFound)
    const removed = await ownerClient.request(base('/assets/nope'), { method: 'DELETE' })
    expect(removed.status).toBe(HTTP_STATUS.notFound)
  })
})

describe('library access control', () => {
  it('lets viewers read but not write, and keeps outsiders out entirely', async () => {
    const viewerClient = await inviteAndJoin(viewer, 'viewer')
    const outsiderClient = new TestClient(harness.app, harness.env)
    await outsiderClient.signUpAndVerify(harness.mailbox, outsider)
    const anonymous = new TestClient(harness.app, harness.env)

    const seeded = await ownerClient.post(base('/watermarks'), {
      name: 'Seed',
      spec: DEFAULT_TEXT_SPEC,
    })
    const presetId = watermarkDtoSchema.parse(await seeded.json()).id

    expect(await getStatus(viewerClient, '/watermarks')).toBe(HTTP_STATUS.ok)
    expect(await getStatus(viewerClient, '/assets')).toBe(HTTP_STATUS.ok)
    const viewerCreate = await viewerClient.post(base('/watermarks'), {
      name: 'Nope',
      spec: DEFAULT_TEXT_SPEC,
    })
    expect(viewerCreate.status).toBe(HTTP_STATUS.forbidden)
    expect(await uploadStatus(viewerClient)).toBe(HTTP_STATUS.forbidden)
    const viewerUpdate = await viewerClient.request(base(`/watermarks/${presetId}`), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed by a viewer', spec: DEFAULT_TEXT_SPEC }),
    })
    expect(viewerUpdate.status).toBe(HTTP_STATUS.forbidden)
    const viewerDelete = await viewerClient.request(base(`/watermarks/${presetId}`), {
      method: 'DELETE',
    })
    expect(viewerDelete.status).toBe(HTTP_STATUS.forbidden)

    expect(await getStatus(outsiderClient, '/watermarks')).toBe(HTTP_STATUS.forbidden)
    expect(await getStatus(anonymous, '/watermarks')).toBe(HTTP_STATUS.unauthorized)
    expect(await getStatus(anonymous, '/assets')).toBe(HTTP_STATUS.unauthorized)
  })

  it('lets editors manage presets and logos', async () => {
    const editorClient = await inviteAndJoin(
      { name: 'Eddie Editor', email: 'eddie@example.test', password: 'editors long password' },
      'editor',
    )
    const created = await editorClient.post(base('/watermarks'), {
      name: 'Editor preset',
      spec: DEFAULT_TEXT_SPEC,
    })
    expect(created.status).toBe(HTTP_STATUS.created)
    expect(await uploadStatus(editorClient)).toBe(HTTP_STATUS.created)
  })
})
