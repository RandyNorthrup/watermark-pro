#!/usr/bin/env node
/**
 * Production deployment: builds the Worker and assets for the `production`
 * wrangler environment, applies pending D1 migrations to the production
 * database, then deploys. Every step is fatal on failure so a half-applied
 * release cannot slip through.
 *
 * Prerequisites (one-time): `wrangler login`, and
 * `wrangler secret put BETTER_AUTH_SECRET --env production`.
 */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

const ENVIRONMENT = 'production'
const DATABASE = 'watermark-pro'

// Tool entry points are resolved from node_modules and executed by the
// current Node binary, so no shell is involved and PATH does not matter.
const require = createRequire(import.meta.url)

/** Absolute path of a package's CLI entry, read from its package.json `bin`. */
function binOf(packageName, binName) {
  const manifestPath = require.resolve(`${packageName}/package.json`)
  const manifest = require(manifestPath)
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin[binName]
  return path.join(path.dirname(manifestPath), bin)
}

const TOOLS = {
  vite: binOf('vite', 'vite'),
  wrangler: binOf('wrangler', 'wrangler'),
}

function run(tool, args, extraEnv = {}) {
  console.info(`\n$ ${tool} ${args.join(' ')}`)
  const result = spawnSync(process.execPath, [TOOLS[tool], ...args], {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  })
  if (result.status !== 0) {
    console.error(`${tool} exited with ${String(result.status)}`)
    process.exit(result.status ?? 1)
  }
}

/**
 * `wrangler d1 migrations list` prints a table of migrations that have NOT
 * been applied; an empty list means the remote database is current. Deploying
 * a Worker ahead of its schema would fail every request that touches the new
 * tables, so this is fatal.
 */
function assertNoPendingMigrations() {
  const result = spawnSync(
    process.execPath,
    [TOOLS.wrangler, 'd1', 'migrations', 'list', DATABASE, '--remote', '--env', ENVIRONMENT],
    { encoding: 'utf8', env: { ...process.env, CI: 'true' } },
  )
  if (result.status !== 0) {
    console.error(result.stderr)
    process.exit(result.status ?? 1)
  }
  const pending = result.stdout.match(/^\s*│\s*(\d{4}_[^\s│]+)\s*│/gm) ?? []
  if (pending.length > 0) {
    console.error(`migrations still pending on ${DATABASE}: ${pending.join(', ')}`)
    process.exit(1)
  }
  console.info('remote database is current')
}

// The Cloudflare Vite plugin resolves wrangler.jsonc for the environment named
// by CLOUDFLARE_ENV and writes the resolved config next to the build output.
run('vite', ['build'], { CLOUDFLARE_ENV: ENVIRONMENT })
// CI=true makes wrangler skip its confirmation prompt instead of treating a
// closed stdin as "no", which once left a migration unapplied while the
// Worker that needed it deployed anyway.
run('wrangler', ['d1', 'migrations', 'apply', DATABASE, '--remote', '--env', ENVIRONMENT], {
  CI: 'true',
})
assertNoPendingMigrations()
// No --env here: `wrangler deploy` follows the plugin's deploy redirect to the
// already-resolved production config in dist/.
run('wrangler', ['deploy'])
