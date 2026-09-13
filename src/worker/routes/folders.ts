import { Hono, type Context } from 'hono'
import type { ZodType } from 'zod'

import { accountIdSchema } from '../../shared/account-identity'
import { HTTP_STATUS } from '../../shared/constants'
import {
  contentMoveSchema,
  FOLDER_POLICY,
  folderCreateSchema,
  folderDeleteSchema,
  folderIdSchema,
  folderListQuerySchema,
  folderListSchema,
  folderUpdateSchema,
  folderWriteResultSchema,
} from '../../shared/folders'
import type { AppContext } from '../app-context'
import { apiErrors } from '../errors'
import type { FolderWriteContext, FolderWriteOutcome } from '../folder-store'
import { requireSession } from '../middleware/session'
import { readJsonBody } from '../request-body'
import { payloadFingerprint, syncOperationId } from '../sync'

async function readBody<T>(c: Context<AppContext>, schema: ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(await readJsonBody(c.req.raw, FOLDER_POLICY.requestBytes))
  if (!parsed.success) throw apiErrors.validation(parsed.error.issues)
  return parsed.data
}

function workspaceId(c: Context<AppContext>): string {
  const parsed = accountIdSchema.safeParse(c.req.param('orgId'))
  if (!parsed.success) throw apiErrors.validation('Invalid workspace ID')
  return parsed.data
}

function targetId(c: Context<AppContext>): string {
  const parsed = folderIdSchema.safeParse(c.req.param('id'))
  if (!parsed.success) throw apiErrors.validation('Invalid folder ID')
  return parsed.data
}

async function writeContext(
  c: Context<AppContext>,
  operation: string,
  input: unknown,
): Promise<FolderWriteContext> {
  const session = c.get('session')
  const organizationId = workspaceId(c)
  return {
    organizationId,
    actorId: session.user.id,
    actorName: session.user.name,
    operationId: syncOperationId(c.req.raw) ?? crypto.randomUUID(),
    fingerprint: await payloadFingerprint({ operation, organizationId, input }),
  }
}

function response(c: Context<AppContext>, result: FolderWriteOutcome) {
  if (result.status !== 'applied') {
    if (result.status === 'forbidden') throw apiErrors.forbidden()
    throw apiErrors.conflict()
  }
  return c.json(folderWriteResultSchema.parse(result.value), HTTP_STATUS.ok)
}

export const folderRoutes = new Hono<AppContext>()
  .get('/orgs/:orgId/folders', requireSession, async (c) => {
    const query = folderListQuerySchema.safeParse(c.req.query())
    if (!query.success) throw apiErrors.validation(query.error.issues)
    const folders = await c
      .get('services')
      .folders.list(workspaceId(c), c.get('session').user.id, query.data.kind)
    if (folders === null) throw apiErrors.forbidden()
    return c.json(folderListSchema.parse({ folders }))
  })
  .post('/orgs/:orgId/folders', requireSession, async (c) => {
    const input = await readBody(c, folderCreateSchema)
    return response(
      c,
      await c.get('services').folders.create(await writeContext(c, 'create', input), input),
    )
  })
  .put('/orgs/:orgId/folders/:id', requireSession, async (c) => {
    const input = await readBody(c, folderUpdateSchema)
    const id = targetId(c)
    return response(
      c,
      await c
        .get('services')
        .folders.update(await writeContext(c, 'update', { id, ...input }), id, input),
    )
  })
  .delete('/orgs/:orgId/folders/:id', requireSession, async (c) => {
    const input = await readBody(c, folderDeleteSchema)
    const id = targetId(c)
    return response(
      c,
      await c
        .get('services')
        .folders.delete(
          await writeContext(c, 'delete', { id, ...input }),
          id,
          input.expectedRevision,
          input.expectedVersionId,
        ),
    )
  })
  .post('/orgs/:orgId/folders/move-content', requireSession, async (c) => {
    const input = await readBody(c, contentMoveSchema)
    return response(
      c,
      await c
        .get('services')
        .folders.moveContent(await writeContext(c, 'move-content', input), input),
    )
  })
