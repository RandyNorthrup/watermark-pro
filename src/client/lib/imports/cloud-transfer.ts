/** Shared cloud-transfer boundaries: account ownership, safe names, and honest partial saves. */
import { z } from 'zod'

import type { CloudProviderId, CloudUpload } from './source'
import { ACCOUNT_CHANGED_EVENT } from '../offline-account'
import { captureOfflineOwner } from '../offline-context'

const MAX_CLOUD_NAME = 255
const MAX_CLOUD_ID = 1024
export const cloudFileIdSchema = z.string().min(1).max(MAX_CLOUD_ID)

export interface CloudSavedFile {
  provider: CloudProviderId
  id: string
  name: string
  manageUrl: string
  userId: string
}

/** A complete filename, never a provider path or traversal segment. */
export function cloudFileName(name: string): string {
  return z
    .string()
    .trim()
    .min(1)
    .max(MAX_CLOUD_NAME)
    .refine(
      (value) => !/[\\/\p{Cc}]/u.test(value) && value !== '.' && value !== '..',
      'Choose a filename without directory separators.',
    )
    .parse(name)
}

/** HTTPS links with exact domain-boundary checks; tokens must never travel to a lookalike host. */
export function trustedCloudUrl(value: string, hosts: readonly string[]): string {
  const url = new URL(value)
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.port !== '' ||
    hosts.every((host) => !(url.hostname === host || url.hostname.endsWith(`.${host}`)))
  ) {
    throw new Error('The cloud provider returned an unexpected URL.')
  }
  return url.href
}

/** Abort active HTTP work on account transitions and suppress its stale result. */
export async function cloudRequest<T>(
  url: string,
  init: RequestInit,
  read: (response: Response) => Promise<T>,
): Promise<T> {
  const owner = captureOfflineOwner()
  const controller = new AbortController()
  const abort = () => controller.abort()
  window.addEventListener(ACCOUNT_CHANGED_EVENT, abort)
  try {
    owner.assertCurrent()
    const response = await fetch(url, {
      ...init,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    })
    owner.assertCurrent()
    const result = await read(response)
    owner.assertCurrent()
    return result
  } finally {
    window.removeEventListener(ACCOUNT_CHANGED_EVENT, abort)
  }
}

/** A failed batch retains only confirmed saves; unacknowledged requests are not declared saved. */
export class CloudBatchError extends Error {
  override readonly name = 'CloudBatchError'
  readonly saved: readonly CloudSavedFile[]
  constructor(saved: readonly CloudSavedFile[], attempted: number, total: number, cause: unknown) {
    super(
      `${String(saved.length)} of ${String(total)} files confirmed saved. File ${String(attempted)} failed; later files were not sent. Check the provider before retrying if the connection failed.`,
      { cause },
    )
    this.saved = saved
  }
}

/** Upload serially, checking the app identity before every network mutation. */
export async function uploadCloudBatch(
  uploads: readonly CloudUpload[],
  upload: (file: CloudUpload) => Promise<CloudSavedFile>,
): Promise<CloudSavedFile[]> {
  const owner = captureOfflineOwner()
  const saved: CloudSavedFile[] = []
  for (const file of uploads) {
    owner.assertCurrent()
    try {
      const result = await upload(file)
      owner.assertCurrent()
      saved.push(result)
    } catch (error) {
      owner.assertCurrent()
      throw new CloudBatchError(saved, saved.length + 1, uploads.length, error)
    }
  }
  return saved
}
