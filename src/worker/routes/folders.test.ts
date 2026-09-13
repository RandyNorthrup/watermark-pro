import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { ACCOUNT_ID_HEADER } from '../../shared/account-identity'
import {
  FOLDER_POLICY,
  folderListSchema,
  folderWriteResultSchema,
  type FolderKind,
} from '../../shared/folders'
import { SYNC_OPERATION_HEADER } from '../../shared/sync'
import { DEFAULT_TEXT_SPEC } from '../../shared/watermark'
import { joinAsMember, signUpOwner, TestClient } from '../test-support/client'
import { responseJson, responseStatus } from '../test-support/response'
import { createTestHarness } from '../test-support/test-app'

const OWNER = {
  name: 'Folder Owner',
  email: 'folder-owner@example.test',
  password: 'a folder owner passphrase',
}
const OTHER = {
  name: 'Folder Other',
  email: 'folder-other@example.test',
  password: 'a folder other passphrase',
}
const sessionSchema = z.object({ user: z.object({ id: z.string() }) })

async function postStatus(client: TestClient, path: string, body: unknown) {
  return await responseStatus(client.post(path, body))
}

async function fixture() {
  const harness = createTestHarness()
  const { client: owner, organizationId } = await signUpOwner(harness, OWNER, {
    name: 'Folder Workspace',
    slug: 'folders',
  })
  const ownerId = sessionSchema.parse(await responseJson(owner.get('/api/auth/get-session'))).user
    .id
  return { harness, owner, ownerId, organizationId, path: `/api/orgs/${organizationId}/folders` }
}

async function createFolder(
  client: TestClient,
  path: string,
  name: string,
  parentId: string | null = null,
  kind: FolderKind = 'preset',
) {
  const response = await client.post(path, { id: crypto.randomUUID(), kind, name, parentId })
  expect(response.status).toBe(200)
  const result = folderWriteResultSchema.parse(await response.json())
  if (result.folder === null) throw new Error('Expected a created folder')
  return result.folder
}

describe('workspace folders through authenticated APIs', () => {
  it.each(['owner', 'admin', 'editor', 'viewer', 'non-member', 'anonymous'] as const)(
    'enforces folder access for %s',
    async (role) => {
      const { harness, owner, ownerId, organizationId, path } = await fixture()
      const folder = await createFolder(owner, path, 'Existing')
      let actor = owner
      if (role === 'anonymous' || role === 'non-member') {
        actor = new TestClient(harness.app, harness.env)
        if (role === 'non-member') await actor.signUpAndVerify(harness.mailbox, OTHER)
      } else if (role !== 'owner')
        actor = await joinAsMember(harness, owner, organizationId, OTHER, role)
      const canRead = !['anonymous', 'non-member'].includes(role)
      const canEdit = ['owner', 'admin', 'editor'].includes(role)
      const denied = role === 'anonymous' ? 401 : 403
      const preset = await harness.services.watermarks.create({
        id: crypto.randomUUID(),
        organizationId,
        name: 'Role Check',
        spec: DEFAULT_TEXT_SPEC,
        createdBy: ownerId,
      })
      const moveStatus = await postStatus(actor, `${path}/move-content`, {
        kind: 'preset',
        folderId: null,
        items: [{ id: preset.id, expectedFolderRevision: 0 }],
      })
      expect(moveStatus).toBe(canEdit ? 200 : denied)
      expect(await responseStatus(actor.get(`${path}?kind=preset`))).toBe(canRead ? 200 : denied)
      expect(
        await postStatus(actor, path, {
          id: crypto.randomUUID(),
          name: 'Created',
          parentId: null,
          kind: 'preset',
        }),
      ).toBe(canEdit ? 200 : denied)
      const changed = await actor.request(`${path}/${folder.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Renamed',
          parentId: null,
          expectedRevision: 0,
          expectedVersionId: folder.versionId,
        }),
      })
      expect(changed.status).toBe(canEdit ? 200 : denied)
      const changedFolder = canEdit
        ? folderWriteResultSchema.parse(await changed.json()).folder
        : folder
      const removed = await actor.request(`${path}/${folder.id}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedRevision: 1, expectedVersionId: changedFolder?.versionId }),
      })
      expect(removed.status).toBe(canEdit ? 200 : denied)
    },
  )

  it('rejects cycles, wrong collection parents, duplicate names and nonempty deletion', async () => {
    const { owner, path } = await fixture()
    const parent = await createFolder(owner, path, 'Client Work')
    const child = await createFolder(owner, path, 'Drafts', parent.id)
    expect(
      await postStatus(owner, path, {
        id: crypto.randomUUID(),
        kind: 'preset',
        name: ' client work ',
        parentId: null,
      }),
    ).toBe(409)
    expect(
      await postStatus(owner, path, {
        id: crypto.randomUUID(),
        kind: 'photo',
        name: 'Wrong Collection',
        parentId: parent.id,
      }),
    ).toBe(409)
    const cycle = await owner.request(`${path}/${parent.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: parent.name,
        parentId: child.id,
        expectedRevision: 0,
        expectedVersionId: parent.versionId,
      }),
    })
    expect(cycle.status).toBe(409)
    const nonempty = await owner.request(`${path}/${parent.id}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 0, expectedVersionId: parent.versionId }),
    })
    expect(nonempty.status).toBe(409)
    const folders = folderListSchema.parse(
      await responseJson(owner.get(`${path}?kind=preset`)),
    ).folders
    expect(folders.find((item) => item.id === parent.id)).toMatchObject({
      parentId: null,
      revision: 0,
      childCount: 1,
    })
    for (const name of ['', '.', '..', 'folder/path', String.raw`folder\path`])
      expect(
        await postStatus(owner, path, {
          id: crypto.randomUUID(),
          kind: 'photo',
          name,
          parentId: null,
        }),
      ).toBe(400)
    let last = parent.id
    for (let depth = 1; depth < FOLDER_POLICY.maxDepth; depth += 1) {
      const nested = await createFolder(owner, path, `Level ${String(depth)}`, last)
      last = nested.id
    }
    expect(
      await postStatus(owner, path, {
        id: crypto.randomUUID(),
        kind: 'preset',
        name: 'Too Deep',
        parentId: last,
      }),
    ).toBe(409)
  })

  it('replays exactly once, preserves new versions, and never reapplies an old delete to a recreated folder', async () => {
    const { owner, ownerId, path, harness } = await fixture()
    const id = crypto.randomUUID()
    const operation = crypto.randomUUID()
    const headers = {
      'content-type': 'application/json',
      [ACCOUNT_ID_HEADER]: ownerId,
      [SYNC_OPERATION_HEADER]: operation,
    }
    const input = { id, kind: 'preset', name: 'Original', parentId: null }
    const create = () =>
      owner.request(path, { method: 'POST', headers, body: JSON.stringify(input) })
    expect(await responseStatus(create())).toBe(200)
    expect(await responseStatus(create())).toBe(200)
    expect(harness.audit.records.filter((record) => record.id === operation)).toHaveLength(1)
    const deletionHeaders = { ...headers, [SYNC_OPERATION_HEADER]: crypto.randomUUID() }
    const remove = () =>
      owner.request(`${path}/${id}`, {
        method: 'DELETE',
        headers: deletionHeaders,
        body: JSON.stringify({ expectedRevision: 0, expectedVersionId: operation }),
      })
    expect(await responseStatus(remove())).toBe(200)
    expect(await postStatus(owner, path, { ...input, name: 'Replacement' })).toBe(200)
    expect(await responseStatus(remove())).toBe(200)
    const folders = folderListSchema.parse(
      await responseJson(owner.get(`${path}?kind=preset`)),
    ).folders
    expect(folders).toHaveLength(1)
    expect(folders[0]?.name).toBe('Replacement')
    const changedReplay = await owner.request(path, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...input, name: 'Changed Replay' }),
    })
    expect(changedReplay.status).toBe(409)
  })

  it('moves presets atomically and refuses foreign items, stale versions and nonempty folders', async () => {
    const { owner, path, harness, ownerId, organizationId } = await fixture()
    const folder = await createFolder(owner, path, 'Presets')
    const foreignId = await owner.createOrganization(
      'Another Workspace',
      'another-folder-workspace',
    )
    for (const [id, workspace] of [
      ['first', organizationId],
      ['second', organizationId],
      ['foreign', foreignId],
    ]) {
      await harness.services.watermarks.create({
        id: id ?? '',
        organizationId: workspace ?? '',
        name: id ?? '',
        spec: DEFAULT_TEXT_SPEC,
        createdBy: ownerId,
      })
    }
    expect(
      await postStatus(owner, `${path}/move-content`, {
        kind: 'preset',
        folderId: folder.id,
        items: [
          { id: 'first', expectedFolderRevision: 0 },
          { id: 'foreign', expectedFolderRevision: 0 },
        ],
      }),
    ).toBe(409)
    const untouched = await harness.services.watermarks.find(organizationId, 'first')
    expect(untouched?.folderId ?? null).toBeNull()
    const move = {
      kind: 'preset',
      folderId: folder.id,
      items: [
        { id: 'first', expectedFolderRevision: 0 },
        { id: 'second', expectedFolderRevision: 0 },
      ],
    }
    expect(await postStatus(owner, `${path}/move-content`, move)).toBe(200)
    expect(
      await postStatus(owner, `${path}/move-content`, {
        kind: 'preset',
        folderId: null,
        items: [
          { id: 'first', expectedFolderRevision: 1, expectedFolderVersionId: crypto.randomUUID() },
        ],
      }),
    ).toBe(409)
    expect(await postStatus(owner, `${path}/move-content`, { ...move, folderId: null })).toBe(409)
    const nonempty = await owner.request(`${path}/${folder.id}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 0, expectedVersionId: folder.versionId }),
    })
    expect(nonempty.status).toBe(409)
    const current = folderListSchema.parse(await responseJson(owner.get(`${path}?kind=preset`)))
    expect(current.folders[0]?.itemCount).toBe(2)
  })
})
