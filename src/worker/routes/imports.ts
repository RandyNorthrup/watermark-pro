/**
 * Import a photo from a URL (M16). The Worker fetches on the user's behalf,
 * under the SSRF policy in `url-policy.ts`, then streams the image back to the
 * client. Gated by `photo:['upload']` (the same permission as a direct upload),
 * rate limited per address, size-capped, redirect-capped with every hop
 * re-checked, and sniffed by its bytes rather than its declared type.
 */
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'

import {
  HTTP_STATUS,
  IMPORT_MAX_REDIRECTS,
  IMPORT_RATE_LIMIT,
  IMPORT_TIMEOUT_MS,
  MAX_PHOTO_BYTES,
} from '../../shared/constants'
import type { AppContext } from '../app-context'
import { apiErrors } from '../errors'
import { requirePermission } from '../middleware/permission'
import { requireSession } from '../middleware/session'
import { type ImageType, SNIFF_LENGTH, sniffImageType } from '../uploads'
import { assertImportableUrl, UnsupportableUrlError } from '../url-policy'

const MAX_URL_LENGTH = 2048
const REDIRECT_MIN = 300
const REDIRECT_MAX = 400
const EXTENSION_FOR: Record<ImageType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
}
const IMAGE_FILENAME_PATTERN = /\.(?:png|jpe?g|webp|gif|avif)$/i
const UNSAFE_FILENAME = /[^A-Za-z0-9._-]+/g

const urlImportRequestSchema = z.object({ url: z.string().trim().min(1).max(MAX_URL_LENGTH) })

async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw apiErrors.validation('request body must be JSON')
  }
}

/** A clean download name: the URL's last segment when it looks like an image, else `imported.<ext>`. */
function fileNameFor(url: URL, type: ImageType): string {
  const last = url.pathname.split('/').pop() ?? ''
  const safe = last.replaceAll(UNSAFE_FILENAME, '-')
  return IMAGE_FILENAME_PATTERN.test(safe) ? safe : `imported.${EXTENSION_FOR[type]}`
}

/** Fetches `initial`, following at most `IMPORT_MAX_REDIRECTS` hops and re-checking each against the policy. */
async function fetchWithinPolicy(initial: URL): Promise<Response> {
  let current = initial
  for (let hop = 0; hop <= IMPORT_MAX_REDIRECTS; hop += 1) {
    const response = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(IMPORT_TIMEOUT_MS),
      headers: { accept: 'image/*' },
    })
    if (response.status < REDIRECT_MIN || response.status >= REDIRECT_MAX) {
      return response
    }
    const location = response.headers.get('location')
    if (location === null) {
      throw apiErrors.unsupportedUrl('The link redirects without a destination.')
    }
    current = assertImportableUrl(new URL(location, current).href)
  }
  throw apiErrors.unsupportedUrl('The link redirects too many times.')
}

/** Reads the body, refusing to buffer more than `MAX_PHOTO_BYTES`. */
async function readCapped(body: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    total += value.byteLength
    if (total > MAX_PHOTO_BYTES) {
      await reader.cancel()
      throw apiErrors.payloadTooLarge()
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

export const importRoutes = new Hono<AppContext>().post(
  '/orgs/:orgId/imports/url',
  requireSession,
  requirePermission({ photo: ['upload'] }),
  async (c) => {
    const organizationId = c.req.param('orgId')
    const { importLimiter, audit } = c.get('services')
    const session = c.get('session')
    const address = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'unknown'
    if (!(await importLimiter(`${address}|import`))) {
      throw apiErrors.rateLimited(IMPORT_RATE_LIMIT.windowSeconds)
    }

    const parsed = urlImportRequestSchema.safeParse(await parseJson(c.req.raw))
    if (!parsed.success) {
      throw apiErrors.validation('a url is required')
    }

    let target: URL
    try {
      target = assertImportableUrl(parsed.data.url)
    } catch (error) {
      if (error instanceof UnsupportableUrlError) {
        throw apiErrors.unsupportedUrl(error.message)
      }
      throw error
    }

    let response: Response
    try {
      response = await fetchWithinPolicy(target)
    } catch (error) {
      if (error instanceof UnsupportableUrlError) {
        throw apiErrors.unsupportedUrl(error.message)
      }
      // A redirect the policy already refused throws an HTTPException; let it
      // pass through. Any other failure (network, timeout, aborted fetch) is a
      // fetch error, not an internal fault.
      if (error instanceof HTTPException) {
        throw error
      }
      throw apiErrors.unsupportedUrl('The link could not be fetched.')
    }

    if (!response.ok || response.body === null) {
      throw apiErrors.unsupportedUrl('The link could not be fetched.')
    }
    const declaredLength = response.headers.get('content-length')
    if (declaredLength !== null && Number(declaredLength) > MAX_PHOTO_BYTES) {
      throw apiErrors.payloadTooLarge()
    }

    // workerd types the body as ReadableStream<any>; it yields Uint8Array chunks.
    const bytes = await readCapped(response.body as ReadableStream<Uint8Array>)
    const type = sniffImageType(bytes.subarray(0, SNIFF_LENGTH))
    if (type === null) {
      throw apiErrors.unsupportedMedia()
    }

    await audit.append({
      organizationId,
      actorUserId: session.user.id,
      actorName: session.user.name,
      action: 'photo.import_url',
      targetType: 'photo',
      targetId: target.hostname,
      metadata: { host: target.hostname },
    })

    return new Response(bytes, {
      status: HTTP_STATUS.ok,
      headers: {
        'content-type': type,
        'content-disposition': `inline; filename="${fileNameFor(target, type)}"`,
        'cache-control': 'no-store',
      },
    })
  },
)
