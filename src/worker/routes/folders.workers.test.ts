import { env } from 'cloudflare:workers'

import { and, eq, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { ACCOUNT_ID_HEADER } from '../../shared/account-identity'
import { photoDtoSchema, photoListResponseSchema } from '../../shared/api'
import { watermarkDtoSchema } from '../../shared/api-watermark'
import { folderListSchema, folderWriteResultSchema, type FolderKind } from '../../shared/folders'
import { SYNC_OPERATION_HEADER } from '../../shared/sync'
import { DEFAULT_TEXT_SPEC } from '../../shared/watermark'
import { auditLog, member, photo, watermark, workspaceFolder } from '../db/schema'
import { createApp } from '../index'
import { getServices } from '../services'
import { TestClient } from '../test-support/client'
import { responseJson, responseStatus } from '../test-support/response'

const ownerAccount = {
  name: 'D1 Folder Owner',
  email: 'd1-folder-owner@example.test',
  password: 'a long folder fixture passphrase',
}
const app = createApp()
const sessionSchema = z.object({ user: z.object({ id: z.string() }) })

async function postStatus(client: TestClient, path: string, body: unknown) {
  return await responseStatus(client.post(path, body))
}

describe('folder transactions in real D1', () => {
  let client: TestClient
  let userId: string
  beforeAll(async () => {
    const mailbox = getServices(env).devMailbox
    if (mailbox === undefined) throw new Error('Folder fixture needs a console mailbox')
    client = new TestClient(app, env)
    await client.signUpAndVerify(mailbox, ownerAccount)
    userId = sessionSchema.parse(await responseJson(client.get('/api/auth/get-session'))).user.id
  })
  async function workspace() {
    const id = await client.createOrganization('Folders', `folders-${crypto.randomUUID()}`)
    return { id, path: `/api/orgs/${id}/folders` }
  }
  async function create(
    path: string,
    name: string,
    parentId: string | null = null,
    kind: FolderKind = 'preset',
  ) {
    const result = await client.post(path, { id: crypto.randomUUID(), name, kind, parentId })
    expect(result.status).toBe(200)
    const value = folderWriteResultSchema.parse(await result.json())
    if (value.folder === null) throw new Error('Missing folder result')
    return value.folder
  }
  function operationHeaders(id = crypto.randomUUID()) {
    return {
      'content-type': 'application/json',
      [ACCOUNT_ID_HEADER]: userId,
      [SYNC_OPERATION_HEADER]: id,
    }
  }

  it('saves presets into valid folders and protects a concurrent move while permitting content-only edits', async () => {
    const { db } = getServices(env)
    const current = await workspace()
    const foreign = await workspace()
    const destination = await create(current.path, 'Presets')
    const pictures = await create(current.path, 'Pictures', null, 'photo')
    const unrelated = await create(foreign.path, 'Unrelated')
    const path = `/api/orgs/${current.id}/watermarks`
    for (const folder of [pictures, unrelated]) {
      const status = await postStatus(client, path, {
        name: 'Denied',
        spec: DEFAULT_TEXT_SPEC,
        folderId: folder.id,
      })
      expect(status).toBe(409)
    }
    const created = await client.post(path, {
      name: 'Filed',
      spec: DEFAULT_TEXT_SPEC,
      folderId: destination.id,
    })
    expect(created.status).toBe(201)
    const preset = watermarkDtoSchema.parse(await created.json())
    expect(preset).toMatchObject({
      folderId: destination.id,
      folderRevision: 0,
      folderVersionId: null,
    })
    expect(
      await postStatus(client, `${current.path}/move-content`, {
        kind: 'preset',
        folderId: null,
        items: [{ id: preset.id, expectedFolderRevision: 0 }],
      }),
    ).toBe(200)
    const stale = await client.request(`${path}/${preset.id}`, {
      method: 'PUT',
      headers: operationHeaders(),
      body: JSON.stringify({
        name: 'Stale Folder',
        spec: preset.spec,
        expectedUpdatedAt: preset.updatedAt,
        folderId: destination.id,
        expectedFolderRevision: 0,
        expectedFolderVersionId: null,
      }),
    })
    expect(stale.status).toBe(409)
    const content = await client.request(`${path}/${preset.id}`, {
      method: 'PUT',
      headers: operationHeaders(),
      body: JSON.stringify({
        name: 'Content Only',
        spec: preset.spec,
        expectedUpdatedAt: preset.updatedAt,
      }),
    })
    expect(content.status).toBe(200)
    const updated = watermarkDtoSchema.parse(await content.json())
    expect(updated).toMatchObject({ name: 'Content Only', folderId: null, folderRevision: 1 })
    await db.run(
      sql`CREATE TRIGGER preset_audit_failure BEFORE INSERT ON audit_log WHEN NEW.action = 'watermark.updated' BEGIN SELECT RAISE(ABORT, 'fixture audit unavailable'); END`,
    )
    try {
      const failure = await client.request(`${path}/${preset.id}`, {
        method: 'PUT',
        headers: operationHeaders(),
        body: JSON.stringify({
          name: 'Must Roll Back',
          spec: preset.spec,
          expectedUpdatedAt: updated.updatedAt,
          folderId: destination.id,
          expectedFolderRevision: updated.folderRevision,
          expectedFolderVersionId: updated.folderVersionId,
        }),
      })
      expect(failure.status).toBe(500)
      const saved = await getServices(env).watermarks.find(current.id, preset.id)
      expect(saved).toMatchObject({ name: 'Content Only', folderId: null, folderRevision: 1 })
    } finally {
      await db.run(sql`DROP TRIGGER preset_audit_failure`)
    }
    await db
      .update(member)
      .set({ role: 'viewer' })
      .where(and(eq(member.organizationId, current.id), eq(member.userId, userId)))
    const denied = await getServices(env).watermarks.update(
      current.id,
      preset.id,
      { name: 'Revoked Edit', spec: preset.spec },
      {
        organizationId: current.id,
        actorUserId: userId,
        action: 'watermark.updated',
        targetType: 'watermark',
        targetId: preset.id,
      },
    )
    expect(denied).toBeNull()
    const unchanged = await getServices(env).watermarks.find(current.id, preset.id)
    expect(unchanged?.name).toBe('Content Only')
  })

  it('stores original photo bytes in the chosen folder and filters root separately', async () => {
    const current = await workspace()
    const target = await create(current.path, 'Deliveries', null, 'photo')
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
    const form = new FormData()
    form.append('file', new File([bytes], 'original.png', { type: 'image/png' }))
    form.append('thumbnail', new File([bytes], 'thumbnail.png', { type: 'image/png' }))
    form.append('name', 'Original')
    form.append('width', '4000')
    form.append('height', '3000')
    form.append('folderId', target.id)
    const saved = await client.request(`/api/orgs/${current.id}/photos`, {
      method: 'POST',
      body: form,
    })
    expect(saved.status).toBe(201)
    const dto = photoDtoSchema.parse(await saved.json())
    expect(dto).toMatchObject({
      folderId: target.id,
      width: 4000,
      height: 3000,
      size: bytes.length,
    })
    const served = await client.get(`/api/orgs/${current.id}/photos/${dto.id}/file`)
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(bytes)
    const root = photoListResponseSchema.parse(
      await responseJson(client.get(`/api/orgs/${current.id}/photos?folderId=root`)),
    )
    const folder = photoListResponseSchema.parse(
      await responseJson(client.get(`/api/orgs/${current.id}/photos?folderId=${target.id}`)),
    )
    expect(root.photos).toEqual([])
    expect(folder.photos.map((photo) => photo.id)).toEqual([dto.id])
  })

  it('persists nested folders, rejects cycles and cross-workspace/kind parents, and keeps audit atomic', async () => {
    const { db } = getServices(env)
    const current = await workspace()
    const foreign = await workspace()
    const parent = await create(current.path, 'Client')
    const child = await create(current.path, 'Drafts', parent.id)
    const foreignParent = await create(foreign.path, 'Foreign')
    expect(
      await postStatus(client, current.path, {
        id: crypto.randomUUID(),
        kind: 'preset',
        name: 'Foreign Child',
        parentId: foreignParent.id,
      }),
    ).toBe(409)
    expect(
      await postStatus(client, current.path, {
        id: crypto.randomUUID(),
        kind: 'photo',
        name: 'Wrong Kind',
        parentId: parent.id,
      }),
    ).toBe(409)
    const cycle = await client.request(`${current.path}/${parent.id}`, {
      method: 'PUT',
      headers: operationHeaders(),
      body: JSON.stringify({
        name: parent.name,
        parentId: child.id,
        expectedRevision: 0,
        expectedVersionId: parent.versionId,
      }),
    })
    expect(cycle.status).toBe(409)
    const moved = await client.request(`${current.path}/${child.id}`, {
      method: 'PUT',
      headers: operationHeaders(),
      body: JSON.stringify({
        name: 'Final',
        parentId: null,
        expectedRevision: 0,
        expectedVersionId: child.versionId,
      }),
    })
    expect(moved.status).toBe(200)
    const result = folderWriteResultSchema.parse(await moved.json())
    expect(result.folder).toMatchObject({ name: 'Final', parentId: null, revision: 1 })
    const wrongVersion = await client.request(`${current.path}/${child.id}`, {
      method: 'PUT',
      headers: operationHeaders(),
      body: JSON.stringify({
        name: 'Stale Local Edit',
        parentId: null,
        expectedRevision: 1,
        expectedVersionId: crypto.randomUUID(),
      }),
    })
    expect(wrongVersion.status).toBe(409)
    const rows = folderListSchema.parse(
      await responseJson(client.get(`${current.path}?kind=preset`)),
    )
    expect(rows.folders.find((folder) => folder.id === parent.id)?.childCount).toBe(0)
    expect(rows.folders).toHaveLength(2)
    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.organizationId, current.id), sql`${auditLog.action} LIKE 'folder.%'`))
    expect(audits.map((record) => record.action).toSorted((a, b) => a.localeCompare(b))).toEqual([
      'folder.created',
      'folder.created',
      'folder.updated',
    ])
  })

  it('replays without duplicates or stale deletes and rolls back when audit cannot commit', async () => {
    const { db } = getServices(env)
    const current = await workspace()
    const id = crypto.randomUUID()
    const headers = operationHeaders()
    const body = { id, name: 'Replay', kind: 'preset', parentId: null }
    const request = () =>
      client.request(current.path, { method: 'POST', headers, body: JSON.stringify(body) })
    const results = await Promise.all([request(), request()])
    expect(results.map((response) => response.status)).toEqual([200, 200])
    const records = await db
      .select()
      .from(workspaceFolder)
      .where(eq(workspaceFolder.organizationId, current.id))
    expect(records).toHaveLength(1)
    const deletionHeaders = operationHeaders()
    const remove = () =>
      client.request(`${current.path}/${id}`, {
        method: 'DELETE',
        headers: deletionHeaders,
        body: JSON.stringify({
          expectedRevision: 0,
          expectedVersionId: headers[SYNC_OPERATION_HEADER],
        }),
      })
    expect(await responseStatus(remove())).toBe(200)
    expect(await postStatus(client, current.path, { ...body, name: 'Recreated' })).toBe(200)
    expect(await responseStatus(remove())).toBe(200)
    const remaining = await db.select().from(workspaceFolder).where(eq(workspaceFolder.id, id))
    expect(remaining[0]?.name).toBe('Recreated')
    await db.run(
      sql`CREATE TRIGGER folder_audit_failure BEFORE INSERT ON audit_log WHEN NEW.action = 'folder.created' BEGIN SELECT RAISE(ABORT, 'fixture audit unavailable'); END`,
    )
    try {
      expect(
        await postStatus(client, current.path, {
          id: crypto.randomUUID(),
          name: 'Not Committed',
          kind: 'preset',
          parentId: null,
        }),
      ).toBe(500)
      const unchanged = await db
        .select()
        .from(workspaceFolder)
        .where(eq(workspaceFolder.organizationId, current.id))
      expect(unchanged).toHaveLength(1)
    } finally {
      await db.run(sql`DROP TRIGGER folder_audit_failure`)
    }
  })

  it('moves only requested current versions, rejects mixed foreign items, and refuses deletion of populated folders', async () => {
    const { db } = getServices(env)
    const current = await workspace()
    const foreign = await workspace()
    const target = await create(current.path, 'Saved Photos', null, 'photo')
    const marks = await create(current.path, 'Saved Presets')
    for (const [id, organizationId] of [
      ['own-photo', current.id],
      ['foreign-photo', foreign.id],
    ] as const)
      await db.insert(photo).values({
        id,
        organizationId,
        name: id,
        key: id,
        thumbnailKey: `${id}-thumb`,
        contentType: 'image/png',
        size: 10,
        width: 1,
        height: 1,
        presetId: null,
        presetName: null,
        createdBy: userId,
      })
    await db.insert(watermark).values({
      id: 'own-preset',
      organizationId: current.id,
      name: 'Preset',
      spec: DEFAULT_TEXT_SPEC,
      createdBy: userId,
    })
    const invalid = {
      kind: 'photo',
      folderId: target.id,
      items: [
        { id: 'own-photo', expectedFolderRevision: 0 },
        { id: 'foreign-photo', expectedFolderRevision: 0 },
      ],
    }
    expect(await postStatus(client, `${current.path}/move-content`, invalid)).toBe(409)
    expect(
      await postStatus(client, `${current.path}/move-content`, {
        ...invalid,
        folderId: marks.id,
        items: [invalid.items[0]],
      }),
    ).toBe(409)
    const headers = operationHeaders()
    const request = () =>
      client.request(`${current.path}/move-content`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...invalid, items: [invalid.items[0]] }),
      })
    expect(await responseStatus(request())).toBe(200)
    expect(await responseStatus(request())).toBe(200)
    const [stored] = await db.select().from(photo).where(eq(photo.id, 'own-photo'))
    expect(stored).toMatchObject({ folderId: target.id, folderRevision: 1 })
    expect(
      await postStatus(client, `${current.path}/move-content`, {
        kind: 'photo',
        folderId: null,
        items: [
          {
            id: 'own-photo',
            expectedFolderRevision: 1,
            expectedFolderVersionId: crypto.randomUUID(),
          },
        ],
      }),
    ).toBe(409)
    const nonempty = await client.request(`${current.path}/${target.id}`, {
      method: 'DELETE',
      headers: operationHeaders(),
      body: JSON.stringify({ expectedRevision: 0, expectedVersionId: target.versionId }),
    })
    expect(nonempty.status).toBe(409)
    expect(
      await postStatus(client, `${current.path}/move-content`, {
        kind: 'photo',
        folderId: null,
        items: [{ id: 'own-photo', expectedFolderRevision: 0 }],
      }),
    ).toBe(409)
    expect(
      await postStatus(client, `${current.path}/move-content`, {
        kind: 'photo',
        folderId: null,
        items: [
          {
            id: 'own-photo',
            expectedFolderRevision: 1,
            expectedFolderVersionId: stored?.folderVersionId,
          },
        ],
      }),
    ).toBe(200)
    const emptyDeletion = await client.request(`${current.path}/${target.id}`, {
      method: 'DELETE',
      headers: operationHeaders(),
      body: JSON.stringify({ expectedRevision: 0, expectedVersionId: target.versionId }),
    })
    expect(emptyDeletion.status).toBe(200)
  })

  it('allows only one concurrent move of the same version and rejects a stale revoked editor', async () => {
    const { db, folders } = getServices(env)
    const current = await workspace()
    const left = await create(current.path, 'Left')
    const right = await create(current.path, 'Right')
    const treeRace = await Promise.all(
      [
        [left, right],
        [right, left],
      ].map(async ([source, target]) => {
        if (source === undefined || target === undefined)
          throw new Error('Missing tree race folder')
        return await client.request(`${current.path}/${source.id}`, {
          method: 'PUT',
          headers: operationHeaders(),
          body: JSON.stringify({
            name: source.name,
            parentId: target.id,
            expectedRevision: source.revision,
            expectedVersionId: source.versionId,
          }),
        })
      }),
    )
    expect(treeRace.map((response) => response.status).toSorted((a, b) => a - b)).toEqual([
      200, 409,
    ])
    await db.insert(watermark).values({
      id: 'racing-preset',
      organizationId: current.id,
      name: 'Racing',
      spec: DEFAULT_TEXT_SPEC,
      createdBy: userId,
    })
    const responses = await Promise.all(
      [left, right].map((folder) =>
        client.post(`${current.path}/move-content`, {
          kind: 'preset',
          folderId: folder.id,
          items: [{ id: 'racing-preset', expectedFolderRevision: 0 }],
        }),
      ),
    )
    expect(responses.map((response) => response.status).toSorted((a, b) => a - b)).toEqual([
      200, 409,
    ])
    await db
      .update(member)
      .set({ role: 'viewer' })
      .where(and(eq(member.organizationId, current.id), eq(member.userId, userId)))
    const result = await folders.create(
      {
        organizationId: current.id,
        actorId: userId,
        actorName: ownerAccount.name,
        operationId: crypto.randomUUID(),
        fingerprint: 'stale-editor',
      },
      { id: crypto.randomUUID(), name: 'Denied', kind: 'preset', parentId: null },
    )
    expect(result).toEqual({ status: 'forbidden' })
    const existing = folderListSchema.parse(
      await responseJson(client.get(`${current.path}?kind=preset`)),
    )
    expect(existing.folders).toHaveLength(2)
  })
})
