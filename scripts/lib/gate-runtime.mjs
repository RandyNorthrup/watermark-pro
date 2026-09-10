/** Start the actual built application on isolated SDK storage, with no developer/remote binding state. */
import { randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createTestHarness } from 'wrangler'
import { z } from 'zod'

import { createGateBridge } from './gate-http-bridge.mjs'
import { GATE_WORKER_PATTERNS } from './gate-routing.mjs'

const SECRET_BYTES = 48
const GATE_PREFIX = 'run-'
const PORT_LIMIT = 65_535
const APP_WORKER_NAME = 'lumafoil-local-gates'
const ROUTER_WORKER_NAME = 'lumafoil-local-gates-router'
const bindingName = z.string().regex(/^[A-Z][A-Z0-9_]*$/)
const databaseSchema = z.looseObject({
  binding: bindingName,
  database_name: z.string().min(1),
  database_id: z.string().min(1),
  migrations_dir: z.string().min(1),
})
const bucketSchema = z.looseObject({ binding: bindingName, bucket_name: z.string().min(1) })
const assetSchema = z.looseObject({
  directory: z.string().min(1),
  binding: z.literal('ASSETS'),
  run_worker_first: z
    .array(z.enum(GATE_WORKER_PATTERNS))
    .length(GATE_WORKER_PATTERNS.length)
    .refine(
      (patterns) => new Set(patterns).size === GATE_WORKER_PATTERNS.length,
      'The gate supports only the verified canonical Worker-first pattern set.',
    ),
})
const builtSchema = z.object({
  main: z.string().min(1),
  compatibility_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  compatibility_flags: z.array(z.string()),
  rules: z.array(z.unknown()).optional(),
  assets: assetSchema,
  d1_databases: z.array(databaseSchema).min(1),
  r2_buckets: z.array(bucketSchema).min(1),
  ratelimits: z.array(z.unknown()).min(1),
})

async function inside(parent, candidate, description) {
  const actual = await realpath(candidate)
  if (!actual.startsWith(parent + path.sep))
    throw new Error(`${description} escapes its allowed root.`)
  return actual
}

async function builtConfiguration(root) {
  const redirectPath = path.join(root, '.wrangler/deploy/config.json')
  const redirect = z
    .object({ configPath: z.string().min(1) })
    .parse(JSON.parse(await readFile(redirectPath, 'utf8')))
  const dist = await realpath(path.join(root, 'dist'))
  const configPath = await inside(
    dist,
    path.resolve(path.dirname(redirectPath), redirect.configPath),
    'The gate build configuration',
  )
  const built = builtSchema.parse(JSON.parse(await readFile(configPath, 'utf8')))
  const directory = path.dirname(configPath)
  const main = await inside(dist, path.resolve(directory, built.main), 'The built gate Worker')
  const assets = await inside(
    dist,
    path.resolve(directory, built.assets.directory),
    'Built gate assets',
  )
  const databases = []
  for (const binding of built.d1_databases) {
    const migrations = await inside(
      root,
      path.resolve(directory, binding.migrations_dir),
      'Gate migrations',
    )
    databases.push({ ...binding, remote: false, migrations_dir: migrations })
  }
  return { ...built, main, assets: { ...built.assets, directory: assets }, d1_databases: databases }
}

async function removeOwnedDirectory(directory, parent) {
  const actual = await realpath(directory)
  if (path.dirname(actual) !== parent || !path.basename(actual).startsWith(GATE_PREFIX))
    throw new Error('Refusing to delete unverified gate storage.')
  await rm(actual, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
}

/** Uses the installed supported SDK; migrations finish before any browser request can reach the Worker. */
export async function startGateServer({ root: requestedRoot = process.cwd(), port = 5273 } = {}) {
  if (!Number.isSafeInteger(port) || port < 0 || port > PORT_LIMIT)
    throw new Error('Gate port must be an integer from zero through 65535.')
  const root = await realpath(requestedRoot)
  const built = await builtConfiguration(root)
  const parentPath = path.join(root, 'temp/lumafoil-gates')
  await mkdir(parentPath, { recursive: true })
  const parent = await inside(root, parentPath, 'Gate storage')
  const directory = await mkdtemp(path.join(parent, GATE_PREFIX))
  let bridge
  let harness
  let closing
  async function dispose() {
    const outcomes = await Promise.allSettled([bridge?.close(), harness?.close()])
    await removeOwnedDirectory(directory, parent)
    const errors = outcomes
      .filter((result) => result.status === 'rejected')
      .map((result) => result.reason)
    if (errors.length > 0)
      throw new AggregateError(errors, 'Gate resources could not all be closed.')
  }
  function close() {
    closing ??= dispose()
    return closing
  }
  try {
    bridge = await createGateBridge(port)
    const configPath = path.join(directory, 'wrangler.json')
    const config = {
      ...built,
      name: APP_WORKER_NAME,
      no_bundle: true,
      vars: {
        APP_ENV: 'test',
        APP_URL: bridge.origin,
        EMAIL_PROVIDER: 'console',
        EMAIL_FROM: 'test@example.test',
      },
      r2_buckets: built.r2_buckets.map((binding) => ({ ...binding, remote: false })),
      observability: { enabled: false },
    }
    await writeFile(configPath, JSON.stringify(config, null, 2) + '\n')
    const routerConfigPath = path.join(directory, 'router.json')
    const routerMainUrl = new URL('gate-router-worker.mjs', import.meta.url)
    const routerMain = fileURLToPath(routerMainUrl)
    await writeFile(
      routerConfigPath,
      JSON.stringify(
        {
          name: ROUTER_WORKER_NAME,
          main: routerMain,
          compatibility_date: built.compatibility_date,
          // Only this tiny test adapter is bundled to include its shared matcher;
          // the real application's compiled Worker remains no_bundle above.
          no_bundle: false,
          assets: { ...built.assets, run_worker_first: true },
          services: [{ binding: 'APP', service: APP_WORKER_NAME }],
          observability: { enabled: false },
        },
        null,
        2,
      ) + '\n',
    )
    // A local file prevents dotenv/process-environment discovery. The only gate
    // secret is supplied explicitly to the SDK, never inherited from developer QA.
    await writeFile(path.join(directory, '.dev.vars'), '# Test secrets are supplied by the SDK.\n')
    process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false'
    process.env.CLOUDFLARE_INCLUDE_PROCESS_ENV = 'false'
    harness = createTestHarness({
      root: directory,
      workers: [
        {
          configPath,
          secrets: { BETTER_AUTH_SECRET: randomBytes(SECRET_BYTES).toString('base64url') },
        },
        { configPath: routerConfigPath },
      ],
    })
    console.info('Gate startup: starting isolated SDK runtime.')
    await harness.listen()
    console.info('Gate startup: SDK ready; applying local migrations.')
    const worker = harness.getWorker()
    for (const database of config.d1_databases) await worker.applyD1Migrations(database.binding)
    console.info('Gate startup: migrations complete; checking built Worker health.')
    const router = harness.getWorker(ROUTER_WORKER_NAME)
    const health = await router.fetch(bridge.origin + '/api/health', {
      headers: { 'accept-encoding': 'identity' },
      redirect: 'manual',
    })
    const healthResult = await health.json()
    if (
      health.status !== 200 ||
      healthResult.status !== 'ok' ||
      healthResult.environment !== 'test'
    )
      throw new Error('The built gate Worker did not report healthy isolated test state.')
    bridge.ready(router.fetch.bind(router))
    console.info('Gate startup: built Worker healthy; HTTP bridge ready.')
    return { origin: bridge.origin, close, worker, directory }
  } catch (error) {
    console.error('Gate startup failed; closing its owned local resources.')
    try {
      await close()
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Gate startup and cleanup failed.', {
        cause: cleanupError,
      })
    }
    throw error
  }
}
