import { z } from 'zod'

import {
  cloudMediaKind,
  DEFAULT_CLOUD_MEDIA_KINDS,
  toCloudFile,
  type CloudMediaKind,
} from './cloud-media'
import { cloudFileIdSchema, cloudFileName, cloudRequest, trustedCloudUrl } from './cloud-transfer'
import type { CloudProvider } from '../../../shared/cloud-connections'
import { GOOGLE_DRIVE_FILES_ENDPOINT, MICROSOFT_GRAPH_ROOT } from '../../../shared/constants'
import { captureCloudOwner } from '../cloud-connection-context'
import { cloudToken, type CloudToken } from '../cloud-connections'

export interface CloudFolder {
  id: string
  name: string
  path?: string
}
export interface CloudBrowserFile {
  id: string
  name: string
  kind: 'file'
  mimeType: string
  downloadUrl?: string
}
export type CloudBrowserItem = CloudBrowserFile | (CloudFolder & { kind: 'folder' })
export interface CloudSaveTarget {
  folder: CloudFolder
  providerAccountId: string
  generation: number
}
export const CLOUD_ROOT_FOLDER: CloudFolder = { id: 'root', name: '', path: '' }
const MAX_LIST_PAGES = 100
const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder'
const DROPBOX_ROOT = 'https://api.dropboxapi.com/2'
const JSON_TYPE = 'application/json'
const FILE_HOSTS = [
  'files.1drv.com',
  'up.1drv.com',
  'my.microsoftpersonalcontent.com',
  'sharepoint.com',
]

/** A remembered folder is unusable after switching the provider account or replacing its grant. */
export async function cloudTargetToken(
  provider: CloudProvider,
  target?: Pick<CloudSaveTarget, 'providerAccountId' | 'generation'>,
  signal?: AbortSignal,
): Promise<CloudToken> {
  const owner = captureCloudOwner()
  const token = await cloudToken(provider, signal)
  owner.assertCurrent()
  if (
    target !== undefined &&
    (target.providerAccountId !== token.providerAccountId || target.generation !== token.generation)
  )
    throw new Error('The cloud connection changed. Choose the folder again.')
  return token
}

function quotedDriveValue(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll("'", String.raw`\'`)
}

function headers(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': JSON_TYPE }
}

async function json(url: string, init: RequestInit): Promise<unknown> {
  return await cloudRequest(url, init, async (response) => {
    if (!response.ok)
      throw new Error(
        `The cloud provider could not open this location (HTTP ${String(response.status)}).`,
      )
    const payload: unknown = await response.json()
    return payload
  })
}

const googleFileSchema = z.object({ id: cloudFileIdSchema, name: z.string(), mimeType: z.string() })
const graphFileSchema = z.object({ mimeType: z.string() })
const graphItemSchema = z.object({
  id: cloudFileIdSchema,
  name: z.string(),
  folder: z.unknown().optional(),
  file: graphFileSchema.optional(),
  '@microsoft.graph.downloadUrl': z.string().optional(),
})
const dropboxItemSchema = z.object({
  '.tag': z.string(),
  id: cloudFileIdSchema,
  name: z.string(),
  path_lower: z.string().optional(),
})
const googleListing = z.object({
  files: z.array(googleFileSchema),
  nextPageToken: z.string().optional(),
})
const graphListing = z.object({
  value: z.array(graphItemSchema),
  '@odata.nextLink': z.string().optional(),
})
const dropboxListing = z.object({
  entries: z.array(dropboxItemSchema),
  cursor: z.string(),
  has_more: z.boolean(),
})

/** Provider listing follows bounded pages within the same account and folder, retaining original file MIME metadata. */
export async function listCloudFolder(
  provider: CloudProvider,
  token: string,
  folder: CloudFolder,
  mediaKinds: readonly CloudMediaKind[] = DEFAULT_CLOUD_MEDIA_KINDS,
  signal?: AbortSignal,
): Promise<CloudBrowserItem[]> {
  const owner = captureCloudOwner()
  const result: CloudBrowserItem[] = []
  const seen = new Set<string>()
  let cursor: string | undefined
  do {
    owner.assertCurrent()
    const pageKey = cursor ?? ''
    if (seen.has(pageKey) || seen.size >= MAX_LIST_PAGES)
      throw new Error('The cloud provider returned an invalid folder listing.')
    seen.add(pageKey)
    if (provider === 'google') {
      const parameters = new URLSearchParams({
        q: `'${quotedDriveValue(folder.id)}' in parents and trashed = false`,
        fields: 'files(id,name,mimeType),nextPageToken',
        pageSize: '100',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
        ...(cursor !== undefined && { pageToken: cursor }),
      })
      const page = googleListing.parse(
        await json(`${GOOGLE_DRIVE_FILES_ENDPOINT}?${parameters.toString()}`, {
          signal: signal ?? null,
          headers: headers(token),
        }),
      )
      for (const item of page.files) {
        if (item.mimeType === DRIVE_FOLDER_MIME)
          result.push({ id: item.id, name: item.name, kind: 'folder' })
        else {
          const kind = cloudMediaKind(item.mimeType, item.name)
          if (kind !== null && mediaKinds.includes(kind)) result.push({ ...item, kind: 'file' })
        }
      }
      cursor = page.nextPageToken
    } else if (provider === 'onedrive') {
      const first =
        folder.id === 'root'
          ? `${MICROSOFT_GRAPH_ROOT}/me/drive/root/children`
          : `${MICROSOFT_GRAPH_ROOT}/me/drive/items/${encodeURIComponent(folder.id)}/children`
      const url = new URL(cursor ?? first)
      if (
        url.origin !== new URL(first).origin ||
        url.pathname !== new URL(first).pathname ||
        url.username !== '' ||
        url.password !== ''
      )
        throw new Error('OneDrive returned an unexpected page link.')
      const page = graphListing.parse(
        await json(url.href, { signal: signal ?? null, headers: headers(token) }),
      )
      for (const item of page.value) {
        if (item.folder === undefined) {
          const mimeType = item.file?.mimeType ?? ''
          const kind = cloudMediaKind(mimeType, item.name)
          const downloadUrl = item['@microsoft.graph.downloadUrl']
          if (kind !== null && downloadUrl !== undefined && mediaKinds.includes(kind))
            result.push({
              id: item.id,
              name: item.name,
              kind: 'file',
              mimeType,
              downloadUrl: trustedCloudUrl(downloadUrl, FILE_HOSTS),
            })
        } else {
          result.push({ id: item.id, name: item.name, kind: 'folder' })
        }
      }
      cursor = page['@odata.nextLink']
    } else {
      const page = dropboxListing.parse(
        await json(`${DROPBOX_ROOT}/files/list_folder${cursor === undefined ? '' : '/continue'}`, {
          method: 'POST',
          signal: signal ?? null,
          headers: headers(token),
          body: JSON.stringify(
            cursor === undefined
              ? { path: folder.path ?? folder.id, recursive: false, include_deleted: false }
              : { cursor },
          ),
        }),
      )
      for (const item of page.entries) {
        if (item['.tag'] === 'folder')
          result.push({
            id: item.id,
            name: item.name,
            kind: 'folder',
            ...(item.path_lower !== undefined && { path: item.path_lower }),
          })
        else if (item['.tag'] === 'file') {
          const kind = cloudMediaKind('', item.name)
          if (kind !== null && mediaKinds.includes(kind))
            result.push({ id: item.id, name: item.name, kind: 'file', mimeType: '' })
        }
      }
      cursor = page.has_more ? page.cursor : undefined
    }
  } while (cursor !== undefined)
  owner.assertCurrent()
  return result
}

/** Folder creation is explicit and remains within the chosen provider destination. */
export async function createCloudFolder(
  provider: CloudProvider,
  token: string,
  parent: CloudFolder,
  name: string,
  signal?: AbortSignal,
): Promise<CloudFolder> {
  const safeName = cloudFileName(name)
  if (provider === 'dropbox') {
    const path = `${parent.path ?? parent.id}/${safeName}`
    const created = z
      .object({
        metadata: z.object({ id: cloudFileIdSchema, name: z.string(), path_lower: z.string() }),
      })
      .parse(
        await json(`${DROPBOX_ROOT}/files/create_folder_v2`, {
          method: 'POST',
          signal: signal ?? null,
          headers: headers(token),
          body: JSON.stringify({ path, autorename: false }),
        }),
      ).metadata
    return { id: created.id, name: created.name, path: created.path_lower }
  }
  const graphUrl =
    parent.id === 'root'
      ? `${MICROSOFT_GRAPH_ROOT}/me/drive/root/children`
      : `${MICROSOFT_GRAPH_ROOT}/me/drive/items/${encodeURIComponent(parent.id)}/children`
  const url =
    provider === 'google' ? `${GOOGLE_DRIVE_FILES_ENDPOINT}?supportsAllDrives=true` : graphUrl
  const body =
    provider === 'google'
      ? { name: safeName, mimeType: DRIVE_FOLDER_MIME, parents: [parent.id] }
      : { name: safeName, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }
  return z.object({ id: cloudFileIdSchema, name: z.string() }).parse(
    await json(url, {
      method: 'POST',
      signal: signal ?? null,
      headers: headers(token),
      body: JSON.stringify(body),
    }),
  )
}

/** Downloads preserve bytes; preauthenticated provider URLs never receive bearer credentials. */
export async function downloadCloudFile(
  provider: CloudProvider,
  token: string,
  file: CloudBrowserFile,
  mediaKinds: readonly CloudMediaKind[],
  signal?: AbortSignal,
): Promise<File> {
  const owner = captureCloudOwner()
  let url: string
  let request: RequestInit
  if (provider === 'google') {
    url = `${GOOGLE_DRIVE_FILES_ENDPOINT}/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`
    request = { signal: signal ?? null, headers: { Authorization: `Bearer ${token}` } }
  } else if (provider === 'dropbox') {
    const temporary = z.object({ link: z.string() }).parse(
      await json(`${DROPBOX_ROOT}/files/get_temporary_link`, {
        method: 'POST',
        signal: signal ?? null,
        headers: headers(token),
        body: JSON.stringify({ path: file.id }),
      }),
    )
    url = trustedCloudUrl(temporary.link, ['dropboxusercontent.com'])
    request = { signal: signal ?? null }
  } else {
    if (file.downloadUrl === undefined) throw new Error('This OneDrive file has no download URL.')
    url = trustedCloudUrl(file.downloadUrl, FILE_HOSTS)
    request = { signal: signal ?? null }
  }
  owner.assertCurrent()
  return await cloudRequest(url, { ...request, redirect: 'follow' }, async (response) => {
    if (!response.ok)
      throw new Error(`Could not download "${file.name}" (HTTP ${String(response.status)}).`)
    const downloadHosts = {
      google: ['www.googleapis.com', 'googleusercontent.com'],
      dropbox: ['dropboxusercontent.com', 'dropbox.com'],
      onedrive: FILE_HOSTS,
    }
    if (response.url !== '') trustedCloudUrl(response.url, downloadHosts[provider])
    const blob = await response.blob()
    return toCloudFile(blob, file.name, file.mimeType, mediaKinds)
  })
}
