/** Native links are a separate, explicit action after a confirmed cloud save. */
import { z } from 'zod'

import {
  cloudFileIdSchema,
  cloudRequest,
  trustedCloudUrl,
  type CloudSavedFile,
} from './cloud-transfer'
import { acquireDropboxToken } from './dropbox-save'
import { acquireGoogleDriveToken } from './google-picker'
import { acquireGraphToken } from './onedrive'
import type { PublicConfig } from '../../../shared/api'
import {
  GOOGLE_DRIVE_FILES_ENDPOINT,
  HTTP_STATUS,
  MICROSOFT_GRAPH_ROOT,
} from '../../../shared/constants'
import { captureOfflineOwner } from '../offline-context'

const DROPBOX_SHARING_ROOT = 'https://api.dropboxapi.com/2/sharing'
const JSON_TYPE = 'application/json'
const permissionSchema = z.object({ id: cloudFileIdSchema })
const dropboxLinkSchema = z.object({ url: z.string(), id: z.string().optional() })
const dropboxLinksSchema = z.object({ links: z.array(dropboxLinkSchema) })

export interface CloudShareLink {
  url: string
  permissionId: string
}

function assertFileOwner(file: CloudSavedFile) {
  const owner = captureOfflineOwner()
  if (file.userId !== owner.userId)
    throw new Error('These saved cloud files belong to another app account.')
  return owner
}

async function tokenFor(config: PublicConfig, file: CloudSavedFile): Promise<string> {
  const tokenAcquirers = {
    google: acquireGoogleDriveToken,
    dropbox: acquireDropboxToken,
    onedrive: acquireGraphToken,
  }
  const owner = assertFileOwner(file)
  const clientId = {
    google: config.googleOAuthClientId,
    dropbox: config.dropboxAppKey,
    onedrive: config.microsoftClientId,
  }[file.provider]
  if (clientId === null) throw new Error('This cloud provider is not configured.')
  const token = await tokenAcquirers[file.provider](clientId)
  owner.assertCurrent()
  return token
}

function headers(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': JSON_TYPE }
}

async function dropboxLink(token: string, file: CloudSavedFile): Promise<CloudShareLink> {
  return await cloudRequest(
    `${DROPBOX_SHARING_ROOT}/create_shared_link_with_settings`,
    {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({ path: file.id, settings: { requested_visibility: 'public' } }),
    },
    async (response) => {
      if (response.status === HTTP_STATUS.conflict) {
        // Dropbox returns 409 when a link already exists. Listing is read-only;
        // only the exact chosen file's direct link may be reused.
        return await cloudRequest(
          `${DROPBOX_SHARING_ROOT}/list_shared_links`,
          {
            method: 'POST',
            headers: headers(token),
            body: JSON.stringify({ path: file.id, direct_only: true }),
          },
          async (existing) => {
            if (!existing.ok)
              throw new Error(
                `Dropbox could not retrieve the existing link (HTTP ${String(existing.status)}). Open the file in Dropbox to manage access.`,
              )
            const payload = dropboxLinksSchema.parse(await existing.json())
            const link = payload.links.find((candidate) => candidate.id === file.id)
            if (link === undefined)
              throw new Error(
                'Dropbox did not return a link for this file. Open the file in Dropbox to manage access.',
              )
            return { url: trustedCloudUrl(link.url, ['dropbox.com']), permissionId: file.id }
          },
        )
      }
      if (!response.ok)
        throw new Error(
          `Dropbox could not create a sharing link (HTTP ${String(response.status)}). Open Dropbox to check your sharing policy.`,
        )
      const payload = z.object({ url: z.string() }).parse(await response.json())
      return { url: trustedCloudUrl(payload.url, ['dropbox.com']), permissionId: file.id }
    },
  )
}

/** Grant view access only after the member chooses Create public link. */
export async function createCloudShare(
  config: PublicConfig,
  file: CloudSavedFile,
): Promise<CloudShareLink> {
  const owner = assertFileOwner(file)
  const token = await tokenFor(config, file)
  owner.assertCurrent()
  const id = encodeURIComponent(cloudFileIdSchema.parse(file.id))
  if (file.provider === 'dropbox') return await dropboxLink(token, file)
  if (file.provider === 'google') {
    return await cloudRequest(
      `${GOOGLE_DRIVE_FILES_ENDPOINT}/${id}/permissions?fields=id`,
      {
        method: 'POST',
        headers: headers(token),
        body: JSON.stringify({ type: 'anyone', role: 'reader', allowFileDiscovery: false }),
      },
      async (response) => {
        if (!response.ok)
          throw new Error(
            `Google Drive could not create a sharing link (HTTP ${String(response.status)}). Open Drive to check sharing restrictions.`,
          )
        const permission = permissionSchema.parse(await response.json())
        return {
          url: trustedCloudUrl(file.manageUrl, ['drive.google.com']),
          permissionId: permission.id,
        }
      },
    )
  }
  return await cloudRequest(
    `${MICROSOFT_GRAPH_ROOT}/me/drive/items/${id}/createLink`,
    {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({ type: 'view', scope: 'anonymous' }),
    },
    async (response) => {
      if (!response.ok)
        throw new Error(
          `OneDrive could not create a public link (HTTP ${String(response.status)}). Your organization may restrict anonymous sharing; open OneDrive to choose another access level.`,
        )
      const permission = z
        .object({
          id: cloudFileIdSchema,
          link: z.object({
            webUrl: z.string(),
            type: z.literal('view'),
            scope: z.literal('anonymous'),
          }),
        })
        .parse(await response.json())
      return {
        url: trustedCloudUrl(permission.link.webUrl, [
          '1drv.ms',
          'onedrive.live.com',
          'sharepoint.com',
        ]),
        permissionId: permission.id,
      }
    },
  )
}

/** Revoke only the explicit link permission; deleting a link never deletes the file. */
export async function revokeCloudShare(
  config: PublicConfig,
  file: CloudSavedFile,
  link: CloudShareLink,
): Promise<void> {
  const owner = assertFileOwner(file)
  const token = await tokenFor(config, file)
  owner.assertCurrent()
  const fileId = encodeURIComponent(cloudFileIdSchema.parse(file.id))
  const permissionId = encodeURIComponent(cloudFileIdSchema.parse(link.permissionId))
  const endpoint = {
    google: `${GOOGLE_DRIVE_FILES_ENDPOINT}/${fileId}/permissions/${permissionId}`,
    onedrive: `${MICROSOFT_GRAPH_ROOT}/me/drive/items/${fileId}/permissions/${permissionId}`,
    dropbox: `${DROPBOX_SHARING_ROOT}/revoke_shared_link`,
  }[file.provider]
  await cloudRequest(
    endpoint,
    {
      method: file.provider === 'dropbox' ? 'POST' : 'DELETE',
      headers: headers(token),
      ...(file.provider === 'dropbox' && {
        body: JSON.stringify({ url: trustedCloudUrl(link.url, ['dropbox.com']) }),
      }),
    },
    async (response) => {
      if (!response.ok)
        throw new Error(
          `The cloud provider could not revoke this link (HTTP ${String(response.status)}). Open the file in the provider to manage access.`,
        )
      await response.text()
    },
  )
}
