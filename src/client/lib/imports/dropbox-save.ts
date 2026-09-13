/** Dropbox saves use the durable account connection and never overwrite existing files. */
import { z } from 'zod'

import { cloudTargetToken, type CloudSaveTarget } from './cloud-folders'
import {
  cloudFileIdSchema,
  cloudFileName,
  cloudRequest,
  uploadCloudBatch,
  type CloudSavedFile,
} from './cloud-transfer'
import type { CloudUpload, CloudUploadSource } from './source'
import type { PublicConfig } from '../../../shared/api'
import { captureCloudOwner } from '../cloud-connection-context'

const CONTENT_ROOT = 'https://content.dropboxapi.com/2/files'
const FIRST_PRINTABLE_ASCII = 0x20
const LAST_PRINTABLE_ASCII = 0x7e
const HEX_RADIX = 16
const UNICODE_ESCAPE_HEX_LENGTH = 4
const SESSION_CHUNK_BYTES = 8_388_608
/** Single requests stay below Dropbox's 150MB limit; larger media use upload sessions. */
const SINGLE_UPLOAD_BYTES = 134_217_728
const MAX_PATH_LENGTH = 4096
const savedSchema = z.object({ id: cloudFileIdSchema, name: z.string().min(1) })

/** Dropbox-API-Arg is an ASCII HTTP header; escape each UTF-16 code unit without changing names. */
export function escapeNonAscii(text: string): string {
  let escaped = ''
  for (let index = 0; index < text.length; index += 1) {
    // Iterate UTF-16 code units, not code points, so a surrogate pair becomes the
    // two `\uXXXX` escapes JSON understands; `codePointAt` would emit one
    // out-of-range value, so `charCodeAt` is deliberate here.
    // eslint-disable-next-line unicorn/prefer-code-point
    const code = text.charCodeAt(index)
    if (code >= FIRST_PRINTABLE_ASCII && code <= LAST_PRINTABLE_ASCII) {
      escaped += text.charAt(index)
      continue
    }
    escaped += String.raw`\u${code.toString(HEX_RADIX).padStart(UNICODE_ESCAPE_HEX_LENGTH, '0')}`
  }
  return escaped
}

function destinationPath(path: string): string {
  return z
    .string()
    .max(MAX_PATH_LENGTH)
    .refine(
      (value) =>
        value === '' ||
        (value.startsWith('/') &&
          !/[\\\p{Cc}]/u.test(value) &&
          value
            .slice(1)
            .split('/')
            .every((part) => part !== '' && part !== '.' && part !== '..')),
      'Choose a valid Dropbox folder.',
    )
    .parse(path)
}

function commit(name: string, folderPath: string) {
  return {
    path: `${destinationPath(folderPath)}/${cloudFileName(name)}`,
    mode: 'add',
    autorename: true,
    mute: true,
  }
}

/** Explicit folder paths remain relative to the granted app folder; names cannot traverse directories. */
export function dropboxApiArg(name: string, folderPath = ''): string {
  return escapeNonAscii(JSON.stringify(commit(name, folderPath)))
}

async function contentRequest<T>(
  token: string,
  endpoint: string,
  argument: unknown,
  body: Blob,
  read: (response: Response) => Promise<T>,
): Promise<T> {
  return await cloudRequest(
    `${CONTENT_ROOT}/${endpoint}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg':
          typeof argument === 'string' ? argument : escapeNonAscii(JSON.stringify(argument)),
      },
      body,
    },
    async (response) => {
      if (!response.ok)
        throw new Error(`Dropbox could not save this file (HTTP ${String(response.status)}).`)
      return await read(response)
    },
  )
}

async function upload(
  token: string,
  file: CloudUpload,
  folderPath: string,
): Promise<CloudSavedFile> {
  const owner = captureCloudOwner()
  const commitInfo = commit(file.name, folderPath)
  if (file.blob.size === 0) throw new Error('An empty file cannot be saved to Dropbox.')
  let saved: z.infer<typeof savedSchema> | null = null
  if (file.blob.size <= SINGLE_UPLOAD_BYTES) {
    saved = await contentRequest(
      token,
      'upload',
      dropboxApiArg(file.name, folderPath),
      file.blob,
      async (response) => savedSchema.parse(await response.json()),
    )
  } else {
    const session = await contentRequest(
      token,
      'upload_session/start',
      { close: false },
      file.blob.slice(0, SESSION_CHUNK_BYTES),
      async (response) => z.object({ session_id: z.string().min(1) }).parse(await response.json()),
    )
    for (let offset = SESSION_CHUNK_BYTES; offset < file.blob.size; offset += SESSION_CHUNK_BYTES) {
      owner.assertCurrent()
      const end = Math.min(offset + SESSION_CHUNK_BYTES, file.blob.size)
      const cursor = { session_id: session.session_id, offset }
      if (end === file.blob.size)
        saved = await contentRequest(
          token,
          'upload_session/finish',
          { cursor, commit: commitInfo },
          file.blob.slice(offset, end),
          async (response) => savedSchema.parse(await response.json()),
        )
      else
        await contentRequest(
          token,
          'upload_session/append_v2',
          { cursor, close: false },
          file.blob.slice(offset, end),
          () => Promise.resolve(null),
        )
    }
  }
  owner.assertCurrent()
  if (saved === null)
    throw new Error(
      'Dropbox did not confirm the completed upload. Check the provider before retrying.',
    )
  return {
    provider: 'dropbox',
    id: saved.id,
    name: saved.name,
    manageUrl: 'https://www.dropbox.com/home',
    userId: owner.userId,
  }
}

/** A target is supplied by the shared folder browser; programmatic callers retain the app-folder default. */
export async function saveToDropbox(
  config: PublicConfig,
  uploads: CloudUploadSource,
  target?: CloudSaveTarget,
): Promise<CloudSavedFile[]> {
  if (config.dropboxAppKey === null)
    throw new Error('Dropbox is not configured for this deployment.')
  const owner = captureCloudOwner()
  const connection = await cloudTargetToken('dropbox', target)
  const files = typeof uploads === 'function' ? await uploads() : uploads
  owner.assertCurrent()
  if (target !== undefined && target.folder.id !== 'root' && target.folder.path === undefined)
    throw new Error('Dropbox did not provide a save folder path.')
  const path = target?.folder.path ?? ''
  return await uploadCloudBatch(files, async (file) => {
    const current = await cloudTargetToken('dropbox', connection)
    owner.assertCurrent()
    const saved = await upload(current.accessToken, file, path)
    return { ...saved, providerAccountId: current.providerAccountId }
  })
}
