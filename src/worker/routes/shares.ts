/**
 * Share links (PLAN.md M7). Members with the `share` permission publish a
 * set of the organization's photos under a signed, expiring, revocable
 * token; anyone holding the token can view and download those photos and
 * nothing else. Public routes carry no session, are rate limited per
 * address, and never reveal why a token was refused.
 */
import { type Context, Hono } from 'hono'

import {
  publicShareSchema,
  shareCreateRequestSchema,
  shareDtoSchema,
  shareListResponseSchema,
} from '../../shared/api'
import {
  API_RATE_LIMIT,
  HTTP_STATUS,
  MILLISECONDS_PER_SECOND,
  SHARE_PATH_PREFIX,
} from '../../shared/constants'
import type { AppContext } from '../app-context'
import { shareToDto } from '../dto'
import { apiErrors } from '../errors'
import { requirePermission } from '../middleware/permission'
import { requireSession } from '../middleware/session'
import { NEVER_EXPIRES, signShareToken, verifyShareToken } from '../share-token'
import type { PhotoRecord, ShareRecord, StoredObject } from '../stores'

const SECONDS_PER_DAY = 86_400
/** Public responses are cacheable by the visitor's browser for a short while only. */
const PUBLIC_CACHE_CONTROL = 'private, max-age=300'

function shareUrl(appUrl: string, token: string): string {
  return new URL(`${SHARE_PATH_PREFIX}${token}`, appUrl).href
}

async function tokenFor(secret: string, record: ShareRecord): Promise<string> {
  return await signShareToken(secret, { id: record.id, expiresAt: record.expiresAt })
}

async function toDto(c: Context<AppContext>, record: ShareRecord) {
  const { config } = c.get('services')
  const token = await tokenFor(config.BETTER_AUTH_SECRET, record)
  return shareDtoSchema.parse(shareToDto(record, shareUrl(config.APP_URL, token)))
}

async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw apiErrors.validation('request body must be JSON')
  }
}

/**
 * Resolves a public token to a live share. Expiry is checked in the token,
 * revocation in the database; both failures are a plain 404.
 */
async function resolveShare(c: Context<AppContext>): Promise<ShareRecord> {
  const token = c.req.param('token')
  const { config, shares } = c.get('services')
  const claims =
    token === undefined ? null : await verifyShareToken(config.BETTER_AUTH_SECRET, token)
  if (claims === null) {
    throw apiErrors.notFound()
  }
  const record = await shares.findById(claims.id)
  const isLive = record?.revokedAt === null && record.expiresAt === claims.expiresAt
  if (record === null || !isLive) {
    throw apiErrors.notFound()
  }
  return record
}

/** Applies the general per-address limiter to a public route. */
async function limitPublic(c: Context<AppContext>): Promise<void> {
  const { rateLimit } = c.get('services')
  const address = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'unknown'
  const result = await rateLimit.consume(`${address}|/api/share`, {
    window: API_RATE_LIMIT.windowSeconds,
    max: API_RATE_LIMIT.max,
  })
  if (!result.allowed) {
    throw apiErrors.rateLimited(result.retryAfter ?? API_RATE_LIMIT.windowSeconds)
  }
}

function streamPublic(stored: StoredObject, record: PhotoRecord, contentType: string): Response {
  return new Response(stored.body, {
    status: HTTP_STATUS.ok,
    headers: {
      'content-type': contentType,
      'content-length': String(stored.size),
      'cache-control': PUBLIC_CACHE_CONTROL,
      'content-disposition': `inline; filename="${record.name.replaceAll('"', '')}"`,
    },
  })
}

async function sharedPhoto(c: Context<AppContext>): Promise<PhotoRecord> {
  const record = await resolveShare(c)
  const photoId = c.req.param('photoId')
  if (photoId === undefined || !record.photoIds.includes(photoId)) {
    throw apiErrors.notFound()
  }
  const photo = await c.get('services').photos.find(record.organizationId, photoId)
  if (photo === null) {
    throw apiErrors.notFound()
  }
  return photo
}

export const shareRoutes = new Hono<AppContext>()
  .get(
    '/orgs/:orgId/shares',
    requireSession,
    requirePermission({ share: ['create'] }),
    async (c) => {
      const records = await c.get('services').shares.listForOrganization(c.req.param('orgId'))
      const shares = await Promise.all(records.map((record) => toDto(c, record)))
      return c.json(shareListResponseSchema.parse({ shares }), HTTP_STATUS.ok)
    },
  )
  .post(
    '/orgs/:orgId/shares',
    requireSession,
    requirePermission({ share: ['create'] }),
    async (c) => {
      const organizationId = c.req.param('orgId')
      const parsed = shareCreateRequestSchema.safeParse(await parseJson(c.req.raw))
      if (!parsed.success) {
        throw apiErrors.validation(parsed.error.issues)
      }
      const { photos, shares, audit } = c.get('services')
      const owned = await photos.findMany(organizationId, parsed.data.photoIds)
      const ownedIds = new Set(owned.map((photo) => photo.id))
      const missing = parsed.data.photoIds.filter((id) => !ownedIds.has(id))
      if (missing.length > 0) {
        throw apiErrors.validation({ photoIds: 'unknown photos' })
      }
      const session = c.get('session')
      const expiresAt =
        parsed.data.expiresInDays === undefined
          ? NEVER_EXPIRES
          : Math.floor(Date.now() / MILLISECONDS_PER_SECOND) +
            parsed.data.expiresInDays * SECONDS_PER_DAY
      const record = await shares.create({
        id: crypto.randomUUID(),
        organizationId,
        title: parsed.data.title,
        photoIds: [...new Set(parsed.data.photoIds)],
        expiresAt,
        createdBy: session.user.id,
      })
      await audit.append({
        organizationId,
        actorUserId: session.user.id,
        actorName: session.user.name,
        action: 'share.created',
        targetType: 'share',
        targetId: record.id,
        metadata: {
          title: record.title,
          photos: record.photoIds.length,
          expiresAt: record.expiresAt,
        },
      })
      return c.json(await toDto(c, record), HTTP_STATUS.created)
    },
  )
  .post(
    '/orgs/:orgId/shares/:id/revoke',
    requireSession,
    requirePermission({ share: ['revoke'] }),
    async (c) => {
      const organizationId = c.req.param('orgId')
      const { shares, audit } = c.get('services')
      const record = await shares.revoke(organizationId, c.req.param('id'))
      if (record === null) {
        throw apiErrors.notFound()
      }
      const session = c.get('session')
      await audit.append({
        organizationId,
        actorUserId: session.user.id,
        actorName: session.user.name,
        action: 'share.revoked',
        targetType: 'share',
        targetId: record.id,
        metadata: { title: record.title },
      })
      return c.json(await toDto(c, record), HTTP_STATUS.ok)
    },
  )
  .get('/share/:token', async (c) => {
    await limitPublic(c)
    const record = await resolveShare(c)
    const photos = await c.get('services').photos.findMany(record.organizationId, record.photoIds)
    const byId = new Map(photos.map((photo) => [photo.id, photo]))
    const body = publicShareSchema.parse({
      title: record.title,
      expiresAt:
        record.expiresAt === NEVER_EXPIRES
          ? null
          : new Date(record.expiresAt * MILLISECONDS_PER_SECOND).toISOString(),
      photos: record.photoIds.flatMap((id) => {
        const photo = byId.get(id)
        return photo === undefined
          ? []
          : [
              {
                id: photo.id,
                name: photo.name,
                width: photo.width,
                height: photo.height,
                contentType: photo.contentType,
              },
            ]
      }),
    })
    c.header('cache-control', 'no-store')
    return c.json(body, HTTP_STATUS.ok)
  })
  .get('/share/:token/photos/:photoId/file', async (c) => {
    await limitPublic(c)
    const photo = await sharedPhoto(c)
    const stored = await c.get('services').objects.get(photo.key)
    if (stored === null) {
      throw apiErrors.notFound()
    }
    return streamPublic(stored, photo, photo.contentType)
  })
  .get('/share/:token/photos/:photoId/thumbnail', async (c) => {
    await limitPublic(c)
    const photo = await sharedPhoto(c)
    const stored = await c.get('services').objects.get(photo.thumbnailKey)
    if (stored === null) {
      throw apiErrors.notFound()
    }
    return streamPublic(stored, photo, stored.contentType)
  })
