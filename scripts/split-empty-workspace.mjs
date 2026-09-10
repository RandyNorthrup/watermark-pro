/** Applies a private, parameterized operator migration; no deployment identity is committed. */
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { z } from 'zod'

import { privateWorkspaceSplit } from './private-workspace-sql.ts'

const { values } = parseArgs({
  options: {
    account: { type: 'string' },
    database: { type: 'string' },
    'database-id': { type: 'string' },
    target: { type: 'string' },
    'workspace-id': { type: 'string' },
    'expected-members': { type: 'string' },
    'persist-to': { type: 'string' },
    help: { type: 'boolean' },
  },
  strict: true,
})
if (values.help) {
  process.stdout.write(
    'Usage: node scripts/split-empty-workspace.mjs --account ACCOUNT_ID --database NAME --database-id DB_ID --target local|remote --workspace-id ID --expected-members COUNT [--persist-to LOCAL_STATE_PATH]\nRefuses nonempty or changed deployments. Applies one transactional D1 migration; live identifiers stay out of public source.\n',
  )
} else {
  const options = z
    .object({
      account: z.string().regex(/^[a-f0-9]{32}$/),
      database: z.string().regex(/^[A-Za-z0-9_-]+$/),
      'database-id': z.uuid(),
      target: z.enum(['local', 'remote']),
      'workspace-id': z.string(),
      'expected-members': z.string(),
      'persist-to': z.string().optional(),
    })
    .parse(values)
  const queries = privateWorkspaceSplit({
    workspaceId: options['workspace-id'],
    expectedMembers: Number(options['expected-members']),
  })
  const directory = mkdtempSync(path.join(tmpdir(), 'lumafoil-private-cutover-'))
  const migration = path.join(directory, `operator-private-workspace-${randomUUID()}.sql`)
  const config = path.join(directory, 'wrangler.json')
  let operationError
  try {
    writeFileSync(migration, queries.join('\n--> statement-breakpoint\n'), { mode: 0o600 })
    writeFileSync(
      config,
      JSON.stringify({
        name: 'lumafoil-account-maintenance',
        account_id: options.account,
        d1_databases: [
          {
            binding: 'DB',
            database_name: options.database,
            database_id: options['database-id'],
            migrations_dir: directory,
          },
        ],
      }),
      { mode: 0o600 },
    )
    const wrangler = fileURLToPath(
      new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url),
    )
    const command = [
      wrangler,
      'd1',
      'migrations',
      'apply',
      options.database,
      `--${options.target}`,
      '--config',
      config,
    ]
    if (options.target === 'local')
      command.push('--persist-to', path.resolve(options['persist-to'] ?? '.wrangler/state'))
    const result = spawnSync(process.execPath, command, {
      input: 'y\n',
      encoding: 'utf8',
      windowsHide: true,
    })
    if (result.error !== undefined || result.status !== 0)
      throw new Error(
        'Workspace cutover refused or failed. Check the private operator inputs and empty-state preconditions. No identifiers were printed.',
      )
  } catch (error) {
    operationError = error
  }
  // Attempt both file removals even after an operation failure; never recurse through a shared temp tree.
  let hasCleanupFailure = false
  for (const file of [migration, config]) {
    try {
      unlinkSync(file)
    } catch (error) {
      if (error?.code !== 'ENOENT') hasCleanupFailure = true
    }
  }
  try {
    rmdirSync(directory)
  } catch {
    hasCleanupFailure = true
  }
  if (hasCleanupFailure)
    throw new Error(
      'Private operator temporary-file cleanup is incomplete; inspect the local temporary directory before continuing.',
    )
  if (operationError !== undefined) throw operationError
  process.stdout.write(
    'Empty shared workspace replaced with separate private workspaces. Verify counts and one owner membership per account before deployment.\n',
  )
}
