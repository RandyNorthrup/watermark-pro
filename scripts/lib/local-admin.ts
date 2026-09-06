/**
 * Promotes a local preview user to platform administrator.
 *
 * The audit scripts and the end-to-end suite sign up throwaway users through
 * the public API, which can never grant the platform role (that is the
 * point). The preview server keeps its D1 database in `.wrangler/state`, the
 * same store `wrangler d1 execute --local` writes to, so the promotion is
 * done exactly the way the runbook does it in production: a direct UPDATE on
 * the user row.
 *
 * Plain TypeScript with no compile step: Node 24 strips the types when the
 * `.mjs` audit scripts import this file, and Playwright transpiles it for the
 * specs.
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const WRANGLER_BIN = path.join('node_modules', 'wrangler', 'bin', 'wrangler.js')
const DATABASE_NAME = 'watermark-pro'
// Only the addresses the callers mint themselves reach this helper; the
// pattern is still enforced so the value can be embedded in SQL safely.
const SAFE_EMAIL = /^[a-z0-9.-]+@[a-z0-9.-]+$/i

export function promoteToPlatformAdmin(email: string): void {
  if (!SAFE_EMAIL.test(email)) {
    throw new Error(`refusing to embed unexpected email in SQL: ${email}`)
  }
  const result = spawnSync(
    process.execPath,
    [
      WRANGLER_BIN,
      'd1',
      'execute',
      DATABASE_NAME,
      '--local',
      '--command',
      `update user set role = 'admin' where email = '${email}'`,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
  if (result.status !== 0) {
    throw new Error(
      `wrangler d1 execute failed (exit ${String(result.status)}): ${result.stderr}${result.stdout}`,
    )
  }
}
