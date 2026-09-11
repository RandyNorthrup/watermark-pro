import { z } from 'zod'

import type { EditorDocument } from './state'
import { adjustmentsSchema, orientationSchema } from '../../shared/adjustments'
import { watermarkSpecSchema } from '../../shared/watermark'
import { MAX_BORDER_RATIO } from '../engine/pipeline'
import { captureOfflineOwner } from '../lib/offline-context'
import {
  cacheOfflineRecord,
  offlineRecordKey,
  readOfflineRecord,
  removeOfflineRecord,
} from '../lib/offline-database'

const SESSION_RECORD = 'editor-session'
const PHOTO_RECORD = 'editor-session-photo'
export const EDITOR_SESSION_SAVE_DELAY_MS = 300

const sizeSchema = z
  .object({ width: z.number().positive(), height: z.number().positive() })
  .strict()
const cropSchema = z
  .object({
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    width: z.number().positive(),
    height: z.number().positive(),
  })
  .strict()
const borderSchema = z
  .object({
    width: z.number().min(0).max(MAX_BORDER_RATIO),
    colour: z.string().regex(/^#[\da-f]{6}$/i),
  })
  .strict()
const layerSchema = z
  .object({
    id: z.string().min(1),
    presetId: z.string().min(1),
    spec: watermarkSpecSchema,
  })
  .strict()
const editorDocumentSchema = z
  .object({
    orientation: orientationSchema,
    crop: cropSchema.nullable(),
    resize: sizeSchema.nullable(),
    adjust: adjustmentsSchema,
    border: borderSchema.nullable(),
    layers: z.array(layerSchema),
  })
  .strict()
const photoMetadataSchema = z
  .object({
    name: z.string().min(1),
    type: z.string(),
    lastModified: z.number().int().nonnegative(),
    dimensions: sizeSchema,
  })
  .strict()
const editorSessionSchema = z
  .object({
    document: editorDocumentSchema,
    draftSpec: watermarkSpecSchema,
    activeLayerId: z.string().nullable(),
    photo: photoMetadataSchema.nullable(),
  })
  .strict()

interface SessionPhoto {
  file: File
  dimensions: { width: number; height: number }
}

export interface RestoredEditorSession {
  document: EditorDocument
  draftSpec: z.infer<typeof watermarkSpecSchema>
  activeLayerId: string | null
  photo: SessionPhoto | null
}

/** Restore only this admitted account's current workspace editor session. */
export async function loadEditorSession(
  organizationId: string,
): Promise<RestoredEditorSession | null> {
  const owner = captureOfflineOwner()
  const sessionKey = offlineRecordKey(owner.userId, organizationId, SESSION_RECORD)
  const record = await readOfflineRecord(sessionKey)
  owner.assertCurrent()
  if (record === null) return null
  if (record.userId !== owner.userId || record.organizationId !== organizationId)
    throw new Error('Stored editor work belongs to another workspace.')
  const session = editorSessionSchema.parse(record.value)
  if (session.photo === null) return { ...session, photo: null }

  const photoKey = offlineRecordKey(owner.userId, organizationId, PHOTO_RECORD)
  const photoRecord = await readOfflineRecord(photoKey)
  owner.assertCurrent()
  if (
    photoRecord?.userId !== owner.userId ||
    photoRecord.organizationId !== organizationId ||
    !(photoRecord.value instanceof Blob)
  )
    throw new Error('The stored editor photo is unavailable.')
  return {
    ...session,
    photo: {
      file: new File([photoRecord.value], session.photo.name, {
        type: session.photo.type,
        lastModified: session.photo.lastModified,
      }),
      dimensions: session.photo.dimensions,
    },
  }
}

/** Save the current canvas and optional source photo under the admitted account/workspace key. */
export async function saveEditorSession(
  organizationId: string,
  document: EditorDocument,
  draftSpec: z.infer<typeof watermarkSpecSchema>,
  activeLayerId: string | null,
  photo: SessionPhoto | null,
): Promise<void> {
  const owner = captureOfflineOwner()
  const sessionKey = offlineRecordKey(owner.userId, organizationId, SESSION_RECORD)
  const photoKey = offlineRecordKey(owner.userId, organizationId, PHOTO_RECORD)
  if (photo === null) {
    await removeOfflineRecord(owner.userId, organizationId, PHOTO_RECORD)
  } else {
    await cacheOfflineRecord({
      key: photoKey,
      userId: owner.userId,
      organizationId,
      value: photo.file,
    })
  }
  owner.assertCurrent()
  await cacheOfflineRecord({
    key: sessionKey,
    userId: owner.userId,
    organizationId,
    value: editorSessionSchema.parse({
      document,
      draftSpec,
      activeLayerId,
      photo:
        photo === null
          ? null
          : {
              name: photo.file.name,
              type: photo.file.type,
              lastModified: photo.file.lastModified,
              dimensions: photo.dimensions,
            },
    }),
  })
}
