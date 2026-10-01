#!/usr/bin/env node
/** Read back GitHub controls; this command never changes remote settings. */
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'

import { policyMismatches } from './lib/github-policy.mjs'

const policy = JSON.parse(
  await readFile(new URL('../.github/repository-policy.json', import.meta.url), 'utf8'),
)
const API_TIMEOUT_MS = 30_000
let failures = 0
for (const { path, expected } of policy.endpoints) {
  const result = spawnSync('gh', ['api', path], { encoding: 'utf8', timeout: API_TIMEOUT_MS })
  if (result.status !== 0) {
    console.error(
      `GitHub policy: API read failed for ${path}; check gh authentication and repository permissions.`,
    )
    failures += 1
    continue
  }
  const mismatches = policyMismatches(expected, JSON.parse(result.stdout), path)
  for (const mismatch of mismatches) console.error(`GitHub policy drift: ${mismatch}`)
  failures += mismatches.length
}
console.info(
  `GitHub policy: ${failures === 0 ? 'pass' : 'fail'}; ${policy.endpoints.length} endpoints checked.`,
)
process.exitCode = failures === 0 ? 0 : 1
