#!/usr/bin/env node
/** Serve the canonical built Worker with ephemeral SDK storage and an isolated loopback bridge. */
import { runNode } from './lib/cli.mjs'
import { startGateServer } from './lib/gate-runtime.mjs'

const args = process.argv.slice(2)
if (args.some((argument) => argument !== '--built') || args.length > 1)
  throw new Error('Only --built is accepted; the default builds a fresh production artifact.')
if (!args.includes('--built')) runNode('scripts/build.mjs')

process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false'
process.env.CLOUDFLARE_INCLUDE_PROCESS_ENV = 'false'

let gate
try {
  gate = await startGateServer()
  console.info(
    `Isolated gate server: ${gate.origin}; ephemeral D1/R2; developer QA state preserved.`,
  )
} catch {
  console.error(
    'Gate startup failed. The last completed startup stage identifies the failed boundary.',
  )
  process.exitCode = 1
}

async function stop() {
  try {
    await gate?.close()
  } catch {
    console.error('Gate shutdown failed while closing owned local resources.')
    process.exitCode = 1
  }
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
