/**
 * Must be the first import of the client entry. Zod would otherwise probe
 * `new Function` while Better Auth builds its schemas at module load, which
 * the strict Content-Security-Policy reports as a violation on every page.
 */
import { config } from 'zod/v4/core'

config({ jitless: true })
