/** Resolve and run this project's pinned command-line tools without a shell or global installation. */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)

export function binOf(packageName, binName) {
  const manifestPath = require.resolve(`${packageName}/package.json`)
  const manifest = require(manifestPath)
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin[binName]
  if (typeof bin !== 'string') throw new Error(`Package ${packageName} does not expose ${binName}.`)
  return path.join(path.dirname(manifestPath), bin)
}

export function runNode(entry, args = [], extraEnv = {}) {
  console.info(`$ node ${entry} ${args.join(' ')}`)
  const result = spawnSync(process.execPath, [entry, ...args], {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`${entry} exited with ${String(result.status)}.`)
}
