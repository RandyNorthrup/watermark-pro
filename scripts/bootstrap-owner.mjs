/** Explicit operator bootstrap; public authentication never gains an admission bypass. */
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import { z } from 'zod'

const MAX_EMAIL_LENGTH = 254
const MAX_NAME_LENGTH = 80
const MAX_USER_ID_LENGTH = 128
const ownerSchema = z.object({
  email: z
    .email()
    .max(MAX_EMAIL_LENGTH)
    .transform((email) => email.toLowerCase()),
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
})
const targetSchema = z.object({
  database: z.string().regex(/^[A-Za-z0-9_-]+$/),
  target: z.enum(['local', 'remote']),
  environment: z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
})
const createdIdSchema = z.object({ id: z.string() })
const executionResponseSchema = z.array(
  z.object({ success: z.literal(true), results: z.array(createdIdSchema) }),
)

function sqlString(value) {
  return `'${value.replaceAll("'", "''")}'`
}

/** One SQL statement prevents a concurrent second bootstrap or overwrite of existing accounts. */
export function ownerInsert(input, id = randomUUID(), now = Date.now()) {
  const owner = ownerSchema.parse(input)
  return {
    id,
    sql: `INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role)
SELECT ${sqlString(id)}, ${sqlString(owner.name)}, ${sqlString(owner.email)}, 0, ${String(now)}, ${String(now)}, 'owner'
WHERE NOT EXISTS (SELECT 1 FROM user)
RETURNING id;`,
  }
}

/** Explicit pre-guard selection normalizes global roles and requires a verified existing identity. */
export function ownerSelection(userId) {
  const id = z
    .string()
    .min(1)
    .max(MAX_USER_ID_LENGTH)
    .regex(/^[\w-]+$/)
    .parse(userId)
  return {
    id,
    sql: `UPDATE user SET role = CASE WHEN id = ${sqlString(id)} THEN 'owner' ELSE 'user' END
WHERE EXISTS (SELECT 1 FROM user WHERE id = ${sqlString(id)} AND email_verified = 1)
RETURNING id;`,
  }
}

/** CLI accepts identity details only. Passwords and verification tokens never enter operator arguments. */
function bootstrapOwner(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    options: {
      name: { type: 'string' },
      email: { type: 'string' },
      database: { type: 'string' },
      target: { type: 'string' },
      environment: { type: 'string' },
      'existing-user-id': { type: 'string' },
      help: { type: 'boolean' },
    },
    strict: true,
  })
  if (values.help) {
    process.stdout.write(
      'Usage: node scripts/bootstrap-owner.mjs --database DB --target local|remote [--environment production] --email ADDRESS --name NAME\nCreates the first unverified global owner only when the user table is empty. No password is generated.\nBefore owner guards only: replace --email/--name with --existing-user-id VERIFIED_ID to select one owner and make every other account a user. Workspace roles and content are preserved. Review the migration path in docs/self-hosting.md first.\n',
    )
    return
  }
  const target = targetSchema.parse(values)
  const isSelecting = values['existing-user-id'] !== undefined
  const insert = isSelecting ? ownerSelection(values['existing-user-id']) : ownerInsert(values)
  const wrangler = fileURLToPath(
    new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url),
  )
  const command = [
    wrangler,
    'd1',
    'execute',
    target.database,
    `--${target.target}`,
    '--command',
    insert.sql,
    '--json',
  ]
  if (target.environment !== undefined) command.push('--env', target.environment)
  const result = spawnSync(process.execPath, command, { encoding: 'utf8', windowsHide: true })
  if (result.error !== undefined || result.status !== 0)
    throw new Error(
      'Database bootstrap failed. Check the selected database, applied migrations, and Wrangler authentication. No credentials were printed.',
    )
  const responses = executionResponseSchema.parse(JSON.parse(result.stdout))
  if (responses.every((response) => response.results.every((row) => row.id !== insert.id)))
    throw new Error(
      'Owner action refused: initial creation requires an empty database; selection requires the specified verified account. Existing data was not changed.',
    )
  process.stdout.write(
    isSelecting
      ? 'Site owner selected. All other global roles are user; no admins remain. Account identities, workspace roles and content were preserved. Complete the reviewed owner-guard migration before opening access.\n'
      : 'Initial site owner created, pending email verification. Follow docs/self-hosting.md to verify the mailbox and choose sign-in methods.\n',
  )
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    bootstrapOwner()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bootstrap failed.'
    process.stderr.write(
      `${error instanceof z.ZodError ? 'Invalid bootstrap arguments. Run with --help.' : message}\n`,
    )
    process.exitCode = 1
  }
}
