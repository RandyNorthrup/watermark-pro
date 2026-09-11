import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { loadEditorSession, saveEditorSession } from './session'
import { EMPTY_DOCUMENT, type EditorDocument } from './state'
import { DEFAULT_TEXT_SPEC } from '../../shared/watermark'
import { setOfflineUser } from '../lib/offline-context'
import { clearOfflineDatabase } from '../lib/offline-database'

const ORGANIZATION = 'editor-session-workspace'
const USER_A = 'editor-session-user-a'
const USER_B = 'editor-session-user-b'

beforeEach(async () => {
  await clearOfflineDatabase()
  setOfflineUser(USER_A)
})

afterEach(async () => {
  setOfflineUser(null)
  await clearOfflineDatabase()
})

describe('durable editor sessions', () => {
  it('restores canvas state and source bytes only for the account and workspace that saved them', async () => {
    const document: EditorDocument = {
      ...EMPTY_DOCUMENT,
      resize: { width: 640, height: 360 },
      layers: [{ id: 'layer-1', presetId: 'preset-1', spec: DEFAULT_TEXT_SPEC }],
    }
    const source = new File(['private-photo'], 'portrait.jpg', {
      type: 'image/jpeg',
      lastModified: 1234,
    })
    await saveEditorSession(ORGANIZATION, document, DEFAULT_TEXT_SPEC, 'layer-1', {
      file: source,
      dimensions: { width: 900, height: 1600 },
    })

    const restored = await loadEditorSession(ORGANIZATION)
    expect(restored).toMatchObject({
      document,
      activeLayerId: 'layer-1',
      photo: { dimensions: { width: 900, height: 1600 } },
    })
    expect(await restored?.photo?.file.text()).toBe('private-photo')
    expect(restored?.photo?.file.name).toBe('portrait.jpg')

    setOfflineUser(USER_B)
    expect(await loadEditorSession(ORGANIZATION)).toBeNull()
  })

  it('removes the persisted source photo when the canvas returns to the sample scene', async () => {
    const source = new File(['photo'], 'photo.png', { type: 'image/png' })
    await saveEditorSession(ORGANIZATION, EMPTY_DOCUMENT, DEFAULT_TEXT_SPEC, 'draft', {
      file: source,
      dimensions: { width: 100, height: 80 },
    })
    await saveEditorSession(ORGANIZATION, EMPTY_DOCUMENT, DEFAULT_TEXT_SPEC, null, null)

    expect(await loadEditorSession(ORGANIZATION)).toMatchObject({
      document: EMPTY_DOCUMENT,
      activeLayerId: null,
      photo: null,
    })
  })
})
