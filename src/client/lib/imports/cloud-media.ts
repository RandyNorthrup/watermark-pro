import { z } from 'zod'

import { PHOTO_CONTENT_TYPES } from '../../../shared/constants'

export const CLOUD_MEDIA_KINDS = ['image', 'document', 'video'] as const
export type CloudMediaKind = (typeof CLOUD_MEDIA_KINDS)[number]
export const DEFAULT_CLOUD_MEDIA_KINDS: readonly CloudMediaKind[] = ['image']
const TYPES: Record<CloudMediaKind, readonly string[]> = {
  image: PHOTO_CONTENT_TYPES,
  document: ['application/pdf'],
  video: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'],
}
const EXTENSIONS: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
}
const MAX_CLOUD_NAME_LENGTH = 255

/** Filters only advertised container types; the destination editor still validates/decode-checks the actual bytes. */
export function cloudMediaKind(mimeType: string, name = ''): CloudMediaKind | null {
  const type =
    mimeType === '' || mimeType === 'application/octet-stream'
      ? EXTENSIONS[name.split('.').at(-1)?.toLowerCase() ?? '']
      : mimeType.toLowerCase()
  return CLOUD_MEDIA_KINDS.find((kind) => type !== undefined && TYPES[kind].includes(type)) ?? null
}

/** Exact MIME filters keep native Google documents out; converting them needs a separate user choice. */
export function cloudMediaTypes(kinds: readonly CloudMediaKind[]): string[] {
  return kinds.flatMap((kind) => TYPES[kind])
}

/** Preserve original download bytes and name. No image transcode or document conversion happens here. */
export function toCloudFile(
  blob: Blob,
  name: string,
  mimeType: string,
  kinds: readonly CloudMediaKind[],
): File {
  const safeName = z
    .string()
    .min(1)
    .max(MAX_CLOUD_NAME_LENGTH)
    .refine((value) => !/[\p{Cc}\\/]/u.test(value))
    .parse(name)
  const kind = cloudMediaKind(mimeType, safeName)
  if (kind === null || !kinds.includes(kind))
    throw new Error('This file type is not supported by the selected tool.')
  const resolvedType =
    mimeType === '' || mimeType === 'application/octet-stream'
      ? EXTENSIONS[safeName.split('.').at(-1)?.toLowerCase() ?? '']
      : mimeType
  if (resolvedType === undefined)
    throw new Error('The cloud provider did not identify the file type.')
  return new File([blob], safeName, { type: resolvedType })
}
