import { beforeEach, describe, expect, it } from 'vitest'

import { errorCodeOf, joinAsMember, signUpOwner, TestClient } from './test-support/client'
import { createTestHarness, type TestHarness } from './test-support/test-app'
import {
  photoDeleteResponseSchema,
  photoDtoSchema,
  photoListResponseSchema,
  storageUsageSchema,
  watermarkDtoSchema,
} from '../shared/api'
import {
  API_ERROR_CODE,
  HTTP_STATUS,
  MAX_BULK_DELETE,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS_PER_ORGANIZATION,
  MAX_STORAGE_BYTES_PER_ORGANIZATION,
  PHOTO_PAGE_SIZE,
} from '../shared/constants'
import { DEFAULT_TEXT_SPEC } from '../shared/watermark'

const owner = {
  name: 'Gail Gallery',
  email: 'gail@example.test',
  password: 'correct horse battery',
}
const viewer = {
  name: 'Vera Viewer',
  email: 'vera@example.test',
  password: 'viewers long password',
}

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])
const GIF_BYTES = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0])

let harness: TestHarness
let ownerClient: TestClient
let organizationId: string

function base(path = ''): string {
  return `/api/orgs/${organizationId}${path}`
}

function photoForm(name: string, bytes: Uint8Array = PNG_BYTES, presetId?: string): FormData {
  const form = new FormData()
  form.append('file', new File([bytes], `${name}.bin`, { type: 'application/octet-stream' }))
  form.append('thumbnail', new File([JPEG_BYTES], 'thumb.jpg', { type: 'image/jpeg' }))
  form.append('name', name)
  form.append('width', '4000')
  form.append('height', '3000')
  if (presetId !== undefined) {
    form.append('presetId', presetId)
  }
  return form
}

async function upload(client: TestClient, form: FormData): Promise<Response> {
  return await client.request(base('/photos'), { method: 'POST', body: form })
}

async function uploadPhoto(name: string, presetId?: string) {
  const response = await upload(ownerClient, photoForm(name, PNG_BYTES, presetId))
  expect(response.status).toBe(HTTP_STATUS.created)
  return photoDtoSchema.parse(await response.json())
}

async function listPhotos(query = '') {
  const response = await ownerClient.get(base(`/photos${query}`))
  expect(response.status).toBe(HTTP_STATUS.ok)
  return photoListResponseSchema.parse(await response.json())
}

beforeEach(async () => {
  harness = createTestHarness()
  ;({ client: ownerClient, organizationId } = await signUpOwner(harness, owner, {
    name: 'Gallery Studio',
    slug: 'gallery-studio',
  }))
})

describe('photo storage', () => {
  it('uploads a photo with its thumbnail, records the preset, serves both, and audits', async () => {
    const preset = await ownerClient.post(base('/watermarks'), {
      name: 'Studio mark',
      spec: DEFAULT_TEXT_SPEC,
    })
    const presetId = watermarkDtoSchema.parse(await preset.json()).id
    const photo = await uploadPhoto('Beach', presetId)
    expect(photo).toMatchObject({
      name: 'Beach',
      contentType: 'image/png',
      size: PNG_BYTES.byteLength,
      width: 4000,
      height: 3000,
      presetId,
      presetName: 'Studio mark',
    })
    expect(harness.objects.keys().toSorted((a, b) => a.localeCompare(b))).toEqual([
      `org/${organizationId}/photos/${photo.id}`,
      `org/${organizationId}/thumbnails/${photo.id}`,
    ])

    const file = await ownerClient.get(base(`/photos/${photo.id}/file`))
    expect(file.status).toBe(HTTP_STATUS.ok)
    expect(file.headers.get('content-type')).toBe('image/png')
    expect(file.headers.get('cache-control')).toContain('private')
    expect(file.headers.get('content-disposition')).toBe('inline; filename="Beach"')
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(PNG_BYTES)

    const thumbnail = await ownerClient.get(base(`/photos/${photo.id}/thumbnail`))
    expect(thumbnail.status).toBe(HTTP_STATUS.ok)
    expect(thumbnail.headers.get('content-type')).toBe('image/jpeg')

    // Deleting the preset keeps the photo and its recorded preset name.
    await ownerClient.request(base(`/watermarks/${presetId}`), { method: 'DELETE' })
    const listed = await listPhotos()
    expect(listed.photos[0]?.presetName).toBe('Studio mark')

    const usage = await ownerClient.get(base('/photos/usage'))
    expect(storageUsageSchema.parse(await usage.json())).toEqual({
      count: 1,
      bytes: PNG_BYTES.byteLength,
      maxCount: MAX_PHOTOS_PER_ORGANIZATION,
      maxBytes: MAX_STORAGE_BYTES_PER_ORGANIZATION,
    })
    const records = await harness.audit.listForOrganization(organizationId)
    expect(records.map((record) => record.action)).toContain('photo.uploaded')
  })

  it('ignores an unknown preset id, and rejects bad forms, non-images and oversized files', async () => {
    const orphan = await uploadPhoto('Orphan', 'no-such-preset')
    expect(orphan.presetId).toBeNull()

    const gif = await upload(ownerClient, photoForm('Animated', GIF_BYTES))
    expect(gif.status).toBe(HTTP_STATUS.unsupportedMediaType)

    const noThumbnail = new FormData()
    noThumbnail.append('file', new File([PNG_BYTES], 'a.png'))
    noThumbnail.append('name', 'Missing thumb')
    noThumbnail.append('width', '10')
    noThumbnail.append('height', '10')
    const missing = await upload(ownerClient, noThumbnail)
    expect(missing.status).toBe(HTTP_STATUS.badRequest)

    const huge = new Uint8Array(MAX_PHOTO_BYTES + 1)
    huge.set(PNG_BYTES)
    const oversized = await upload(ownerClient, photoForm('Huge', huge))
    expect(oversized.status).toBe(HTTP_STATUS.payloadTooLarge)

    const declared = await ownerClient.request(base('/photos'), {
      method: 'POST',
      headers: { 'content-length': String(MAX_PHOTO_BYTES * 2) },
      body: photoForm('Declared'),
    })
    expect(declared.status).toBe(HTTP_STATUS.payloadTooLarge)

    const tooWide = photoForm('Wide')
    tooWide.set('width', '100000')
    const dimensions = await upload(ownerClient, tooWide)
    expect(dimensions.status).toBe(HTTP_STATUS.badRequest)

    const notMultipart = await ownerClient.post(base('/photos'), { file: 'nope' })
    expect(notMultipart.status).toBe(HTTP_STATUS.badRequest)
    expect(harness.objects.keys()).toHaveLength(2)
  })

  it('enforces the photo count quota before reading the body', async () => {
    for (let index = 0; index < MAX_PHOTOS_PER_ORGANIZATION; index += 1) {
      await harness.services.photos.create({
        id: `count-${String(index)}`,
        organizationId,
        name: `count ${String(index)}`,
        key: `ck${String(index)}`,
        thumbnailKey: `ct${String(index)}`,
        contentType: 'image/png',
        size: 1,
        width: 1,
        height: 1,
        presetId: null,
        presetName: null,
        createdBy: null,
      })
    }
    const overflow = await upload(ownerClient, photoForm('One too many', PNG_BYTES))
    expect(overflow.status).toBe(HTTP_STATUS.badRequest)
    expect(await errorCodeOf(overflow)).toBe(API_ERROR_CODE.quotaExceeded)
    expect(harness.objects.keys()).toEqual([])
  })

  it('enforces the storage byte quota', async () => {
    const big = new Uint8Array(MAX_PHOTO_BYTES)
    big.set(PNG_BYTES)
    const perFile = MAX_PHOTO_BYTES
    const fits = Math.floor(MAX_STORAGE_BYTES_PER_ORGANIZATION / perFile)
    // Fill the quota with records directly; uploading gigabytes through the route is pointless.
    for (let index = 0; index < fits; index += 1) {
      await harness.services.photos.create({
        id: `filler-${String(index)}`,
        organizationId,
        name: `filler ${String(index)}`,
        key: `k${String(index)}`,
        thumbnailKey: `t${String(index)}`,
        contentType: 'image/png',
        size: perFile,
        width: 1,
        height: 1,
        presetId: null,
        presetName: null,
        createdBy: null,
      })
    }
    const overflow = await upload(ownerClient, photoForm('One more', big))
    expect(overflow.status).toBe(HTTP_STATUS.badRequest)
    expect(await errorCodeOf(overflow)).toBe(API_ERROR_CODE.quotaExceeded)
    expect(harness.objects.keys()).toEqual([])
  })

  it('lists newest first with cursor pages, a preset filter and a name search', async () => {
    const preset = await ownerClient.post(base('/watermarks'), {
      name: 'Filter mark',
      spec: DEFAULT_TEXT_SPEC,
    })
    const presetId = watermarkDtoSchema.parse(await preset.json()).id
    const total = PHOTO_PAGE_SIZE + 3
    for (let index = 0; index < total; index += 1) {
      await uploadPhoto(
        `Shot ${String(index).padStart(3, '0')}`,
        index % 2 === 0 ? presetId : undefined,
      )
    }
    const first = await listPhotos()
    expect(first.photos).toHaveLength(PHOTO_PAGE_SIZE)
    expect(first.photos[0]?.name).toBe(`Shot ${String(total - 1).padStart(3, '0')}`)
    expect(first.nextCursor).not.toBeNull()
    const second = await listPhotos(`?cursor=${encodeURIComponent(first.nextCursor ?? '')}`)
    expect(second.photos).toHaveLength(3)
    expect(second.nextCursor).toBeNull()
    const seen = new Set([...first.photos, ...second.photos].map((photo) => photo.id))
    expect(seen.size).toBe(total)

    const filtered = await listPhotos(`?presetId=${presetId}`)
    expect(filtered.photos.every((photo) => photo.presetId === presetId)).toBe(true)
    expect(filtered.photos.length + (filtered.nextCursor === null ? 0 : 1)).toBeGreaterThan(0)

    const searched = await listPhotos('?search=shot%2000')
    expect(searched.photos.map((photo) => photo.name)).toEqual(
      expect.arrayContaining(['Shot 000', 'Shot 001', 'Shot 009']),
    )
    expect(searched.photos.every((photo) => photo.name.startsWith('Shot 00'))).toBe(true)

    const badCursor = await ownerClient.get(base(`/photos?cursor=${'x'.repeat(200)}`))
    expect(badCursor.status).toBe(HTTP_STATUS.badRequest)
  })

  it('deletes many photos at once, removing their objects, and ignores unknown ids', async () => {
    const one = await uploadPhoto('One')
    const two = await uploadPhoto('Two')
    const three = await uploadPhoto('Three')
    const response = await ownerClient.post(base('/photos/delete'), {
      ids: [one.id, two.id, 'not-ours'],
    })
    expect(response.status).toBe(HTTP_STATUS.ok)
    expect(photoDeleteResponseSchema.parse(await response.json())).toEqual({ deleted: 2 })
    expect(harness.objects.keys().toSorted((a, b) => a.localeCompare(b))).toEqual([
      `org/${organizationId}/photos/${three.id}`,
      `org/${organizationId}/thumbnails/${three.id}`,
    ])
    const gone = await ownerClient.get(base(`/photos/${one.id}/file`))
    expect(gone.status).toBe(HTTP_STATUS.notFound)

    const tooMany = await ownerClient.post(base('/photos/delete'), {
      ids: Array.from({ length: MAX_BULK_DELETE + 1 }, (_, index) => `id-${String(index)}`),
    })
    expect(tooMany.status).toBe(HTTP_STATUS.badRequest)
    const empty = await ownerClient.post(base('/photos/delete'), { ids: [] })
    expect(empty.status).toBe(HTTP_STATUS.badRequest)
    const nothing = await ownerClient.post(base('/photos/delete'), { ids: ['ghost'] })
    expect(photoDeleteResponseSchema.parse(await nothing.json())).toEqual({ deleted: 0 })
  })
})

describe('photo access control', () => {
  it('lets viewers read but not upload or delete, and keeps outsiders out', async () => {
    const photo = await uploadPhoto('Seed')
    const viewerClient = await joinAsMember(harness, ownerClient, organizationId, viewer, 'viewer')

    const listed = await viewerClient.get(base('/photos'))
    expect(listed.status).toBe(HTTP_STATUS.ok)
    const thumb = await viewerClient.get(base(`/photos/${photo.id}/thumbnail`))
    expect(thumb.status).toBe(HTTP_STATUS.ok)
    const uploaded = await upload(viewerClient, photoForm('Nope'))
    expect(uploaded.status).toBe(HTTP_STATUS.forbidden)
    const removed = await viewerClient.post(base('/photos/delete'), { ids: [photo.id] })
    expect(removed.status).toBe(HTTP_STATUS.forbidden)

    const anonymous = new TestClient(harness.app, harness.env)
    const denied = await anonymous.get(base(`/photos/${photo.id}/file`))
    expect(denied.status).toBe(HTTP_STATUS.unauthorized)
    const usage = await anonymous.get(base('/photos/usage'))
    expect(usage.status).toBe(HTTP_STATUS.unauthorized)
  })
})
