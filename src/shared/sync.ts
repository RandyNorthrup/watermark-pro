/** Wire contract for replaying a durable offline operation without duplicate creates. */
import { z } from 'zod'

export const SYNC_OPERATION_HEADER = 'x-watermark-operation'
export const syncOperationIdSchema = z.uuid()

/** A preset update may only replace the version the editor originally loaded. */
export const presetVersionSchema = z.iso.datetime()
