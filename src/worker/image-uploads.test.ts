import { beforeEach, describe, expect, it } from 'vitest'

import { joinAsMember, signUpOwner, TestClient } from './test-support/client'
import {
  AVIF_IMAGE,
  GIF_IMAGE,
  LOGO_PNG,
  LOGO_WEBP,
  OVERSIZED_PNG,
  OVERSIZED_THUMBNAIL_PNG,
  PROGRESSIVE_JPEG,
  ROTATED_JPEG_6,
  ROTATED_JPEG_8,
} from './test-support/image-fixtures'
import { createTestHarness, type TestHarness, TEST_APP_URL } from './test-support/test-app'
import { assetDtoSchema, photoDtoSchema } from '../shared/api'
import { watermarkDtoSchema } from '../shared/api-watermark'
import { HTTP_STATUS } from '../shared/constants'
import { folderWriteResultSchema } from '../shared/folders'
import { DEFAULT_TEXT_SPEC } from '../shared/watermark'

const OWNER = {
  name: 'Image Owner',
  email: 'image-owner@example.test',
  password: 'a named image fixture passphrase',
}
let harness: TestHarness
let owner: TestClient
let organizationId: string

function form(bytes = LOGO_PNG, width = 64, height = 32): FormData {
  const value = new FormData()
  value.append('file', new File([bytes], 'misdeclared.bin', { type: 'text/plain' }))
  value.append('thumbnail', new File([LOGO_PNG], 'thumb.bin', { type: 'text/plain' }))
  value.append('name', 'Encoded fixture')
  value.append('width', String(width))
  value.append('height', String(height))
  return value
}

async function upload(
  client: TestClient,
  kind: 'photos' | 'assets',
  value = form(),
  org = organizationId,
) {
  const path = `/api/orgs/${org}/${kind}`
  // Node's direct FormData producer can enqueue after the unread-request guard
  // cancels it. Encode real multipart bytes first, matching an incoming request.
  const request = new Request(`${TEST_APP_URL}${path}`, { method: 'POST', body: value })
  const body = await request.arrayBuffer()
  const contentType = request.headers.get('content-type')
  if (contentType === null) throw new Error('Named multipart fixture has no content type')
  return await client.request(path, {
    method: 'POST',
    headers: { 'content-type': contentType },
    body,
  })
}

beforeEach(async () => {
  harness = createTestHarness()
  const setup = await signUpOwner(harness, OWNER, { name: 'Image studio', slug: 'image-studio' })
  owner = setup.client
  organizationId = setup.organizationId
})

describe.each(['photos', 'assets'] as const)('%s encoded upload boundary', (kind) => {
  it.each(['owner', 'admin', 'editor', 'viewer', 'non-member', 'anonymous'] as const)(
    'preserves real authentication and encoded-image admission for %s',
    async (role) => {
      let client = owner
      if (role === 'anonymous') client = new TestClient(harness.app, harness.env)
      else if (role === 'non-member') {
        const other = await signUpOwner(
          harness,
          { ...OWNER, email: 'image-other@example.test' },
          { name: 'Other', slug: 'image-other' },
        )
        client = other.client
      } else if (role !== 'owner') {
        client = await joinAsMember(
          harness,
          owner,
          organizationId,
          { ...OWNER, email: `image-${role}@example.test` },
          role,
        )
      }
      const canWrite = ['owner', 'admin', 'editor'].includes(role)
      const deniedStatus = role === 'anonymous' ? HTTP_STATUS.unauthorized : HTTP_STATUS.forbidden
      const status = canWrite ? HTTP_STATUS.created : deniedStatus
      const positive = await upload(client, kind)
      expect(positive.status).toBe(status)
      const count = harness.objects.keys().length
      if (canWrite) {
        const schema = kind === 'photos' ? photoDtoSchema : assetDtoSchema
        expect(schema.parse(await positive.json())).toMatchObject({
          width: 64,
          height: 32,
          contentType: 'image/png',
        })
      }
      const malformed = await upload(client, kind, form(LOGO_PNG.slice(0, 12)))
      expect(malformed.status).toBe(canWrite ? HTTP_STATUS.badRequest : status)
      expect(harness.objects.keys()).toHaveLength(count)
      const audits = await harness.audit.listForOrganization(organizationId)
      expect(
        audits.filter(
          (entry) => entry.action === (kind === 'photos' ? 'photo.uploaded' : 'asset.uploaded'),
        ),
      ).toHaveLength(canWrite ? 1 : 0)
    },
  )

  it.each([LOGO_WEBP, PROGRESSIVE_JPEG])(
    'stores supported formats from actual bytes despite declared MIME',
    async (bytes) => {
      const response = await upload(owner, kind, form(bytes))
      expect(response.status).toBe(HTTP_STATUS.created)
      const schema = kind === 'photos' ? photoDtoSchema : assetDtoSchema
      const dto = schema.parse(await response.json())
      expect(dto).toMatchObject({ width: 64, height: 32 })
      expect(dto.contentType).not.toBe('text/plain')
    },
  )

  it.each([ROTATED_JPEG_6, ROTATED_JPEG_8])(
    'stores genuine rotated JPEG display dimensions',
    async (bytes) => {
      const response = await upload(owner, kind, form(bytes, 8, 16))
      expect(response.status).toBe(HTTP_STATUS.created)
      const schema = kind === 'photos' ? photoDtoSchema : assetDtoSchema
      expect(schema.parse(await response.json())).toMatchObject({ width: 8, height: 16 })
      const mismatch = await upload(owner, kind, form(bytes, 16, 8))
      expect(mismatch.status).toBe(HTTP_STATUS.badRequest)
    },
  )

  it.each([
    ['wrong claims', LOGO_PNG, 1, 1, HTTP_STATUS.badRequest],
    ['oversized actual side', OVERSIZED_PNG, 1, 1, HTTP_STATUS.badRequest],
    ['truncated dimension fields', LOGO_PNG.slice(0, 23), 64, 32, HTTP_STATUS.badRequest],
    ['GIF declared as PNG', GIF_IMAGE, 64, 32, HTTP_STATUS.unsupportedMediaType],
    ['AVIF declared as PNG', AVIF_IMAGE, 64, 32, HTTP_STATUS.unsupportedMediaType],
  ] as const)('rejects %s before any upload state', async (_, bytes, width, height, status) => {
    const rejected = form(bytes, width, height)
    rejected.set('file', new File([bytes], 'forged.png', { type: 'image/png' }))
    const response = await upload(owner, kind, rejected)
    expect(response.status).toBe(status)
    expect(harness.objects.keys()).toEqual([])
    const audits = await harness.audit.listForOrganization(organizationId)
    expect(
      audits.filter(
        (entry) => entry.action === (kind === 'photos' ? 'photo.uploaded' : 'asset.uploaded'),
      ),
    ).toEqual([])
    const usage = await harness.services.uploads.usage(organizationId)
    expect(usage).toMatchObject({ count: 0, bytes: 0 })
  })
})

it('rejects a real oversized thumbnail without creating either object', async () => {
  const value = form()
  value.set('thumbnail', new File([OVERSIZED_THUMBNAIL_PNG], 'wide-thumb.png'))
  const response = await upload(owner, 'photos', value)
  expect(response.status).toBe(HTTP_STATUS.badRequest)
  expect(harness.objects.keys()).toEqual([])
  expect(await harness.services.uploads.usage(organizationId)).toMatchObject({ count: 0, bytes: 0 })
})

it('preserves foreign workspace/folder refusal and neutral foreign-preset resolution', async () => {
  const other = await signUpOwner(
    harness,
    { ...OWNER, email: 'image-foreign@example.test' },
    { name: 'Foreign', slug: 'image-foreign' },
  )
  const foreignPhoto = await upload(owner, 'photos', form(), other.organizationId)
  expect(foreignPhoto.status).toBe(HTTP_STATUS.forbidden)
  const foreignLogo = await upload(owner, 'assets', form(), other.organizationId)
  expect(foreignLogo.status).toBe(HTTP_STATUS.forbidden)
  const id = crypto.randomUUID()
  const folder = await other.client.post(`/api/orgs/${other.organizationId}/folders`, {
    id,
    kind: 'photo',
    name: 'Foreign folder',
    parentId: null,
  })
  expect(folder.status).toBe(HTTP_STATUS.ok)
  expect(folderWriteResultSchema.parse(await folder.json()).folder?.id).toBe(id)
  const value = form()
  value.set('folderId', id)
  const foreignFolder = await upload(owner, 'photos', value)
  expect(foreignFolder.status).toBe(HTTP_STATUS.conflict)
  expect(harness.objects.keys()).toEqual([])
  const preset = await other.client.post(`/api/orgs/${other.organizationId}/watermarks`, {
    name: 'Private foreign name',
    spec: DEFAULT_TEXT_SPEC,
  })
  expect(preset.status).toBe(HTTP_STATUS.created)
  const foreignId = watermarkDtoSchema.parse(await preset.json()).id
  const unlinked = form()
  unlinked.set('presetId', foreignId)
  const response = await upload(owner, 'photos', unlinked)
  expect(response.status).toBe(HTTP_STATUS.created)
  const dto = photoDtoSchema.parse(await response.json())
  expect(dto).toMatchObject({ presetId: null, presetName: null })
  expect(JSON.stringify(dto)).not.toContain('Private foreign name')
})
