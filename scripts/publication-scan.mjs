#!/usr/bin/env node
/** Audit publication candidates without printing scanner matches or private values. */
import { writeFile } from 'node:fs/promises'

import { auditPublication } from './lib/publication-audit.mjs'

const allowed = new Set(['--built', '--report'])
const args = process.argv.slice(2)
for (let index = 0; index < args.length; index += 1) {
  if (!allowed.has(args[index])) throw new Error('Unsupported publication audit argument')
  if (args[index] === '--report') {
    if (args[index + 1] === undefined || args[index + 1].startsWith('--'))
      throw new Error('Publication report path is required')
    index += 1
  }
}
try {
  const result = await auditPublication(
    process.cwd(),
    args.includes('--built') ? 'built' : 'source',
  )
  const report = args.includes('--report') ? args[args.indexOf('--report') + 1] : undefined
  if (report !== undefined) await writeFile(report, JSON.stringify(result, null, 2) + '\n')
  console.info(
    `Publication ${result.mode}: ${result.status}; ${result.stats.files} candidate/object checks, ${result.stats.archiveEntries} archive entries, ${result.stats.configuredSecrets} private values compared; ${result.stats.retiredHistoryMaskedOccurrences} revoked-key occurrences masked in historical scan copies, ${result.stats.retiredHistoryFindings} exact revoked historical findings accepted.`,
  )
  for (const finding of result.findings) console.error(JSON.stringify(finding))
  if (result.status !== 'pass') process.exitCode = 1
} catch (error) {
  console.error(
    `Publication audit could not complete: ${error instanceof Error ? error.message : 'unexpected tool failure'}`,
  )
  process.exitCode = 1
}
