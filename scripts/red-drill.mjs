#!/usr/bin/env node
/**
 * Red drill: proves the tests and gates catch what they claim to catch.
 *
 * For every entry in scripts/red-drills.mjs the script breaks one behaviour
 * in one source file, runs the command that should notice, restores the
 * file, and records whether the command went red. A drill whose command
 * stayed green is a survivor, and survivors fail the run: a test that stays
 * green while its subject is broken is decoration, not a gate (PLAN.md §3.2).
 *
 *   node scripts/red-drill.mjs            # every drill
 *   node scripts/red-drill.mjs --unit     # skip the end-to-end drills
 *   node scripts/red-drill.mjs "Share"    # drills whose name contains "Share"
 *
 * The e2e drills build and serve the app through Playwright's web server, so
 * port 5173 must be free. Every file is restored byte for byte even when a
 * command throws; the script checks that before it exits. Results land in
 * docs/red-drill/<date>.md.
 */
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { stripVTControlCharacters } from 'node:util'

import { DRILLS } from './red-drills.mjs'

const REPORT_DIR = path.join('docs', 'red-drill')
/** Long enough for an e2e drill's build, migration and browser run. */
const COMMAND_TIMEOUT_MS = 15 * 60 * 1000

const options = process.argv.slice(2)
const isUnitOnly = options.includes('--unit')
const filter = options.find((option) => !option.startsWith('--')) ?? ''

function isEndToEnd(drill) {
  return drill.command.some((part) => part.includes('playwright'))
}

/** The command as a person would type it, without the entry-file paths the runner needs. */
function describeCommand(command) {
  return command
    .map((part) => {
      if (part.endsWith('npm-cli.js')) {
        return 'npm'
      }
      if (part.endsWith('vitest.mjs')) {
        return 'vitest'
      }
      return part.endsWith('cli.js') && part.includes('playwright') ? 'playwright' : part
    })
    .join(' ')
}

/** The run's date where it was run (an evening run must not land on tomorrow's UTC date). */
function localDate() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${String(now.getFullYear())}-${month}-${day}`
}

const selected = DRILLS.filter(
  (drill) => drill.name.includes(filter) && !(isUnitOnly && isEndToEnd(drill)),
)
if (selected.length === 0) {
  throw new Error(`no drills match ${JSON.stringify(filter)}`)
}

function countOccurrences(haystack, needle) {
  let count = 0
  let index = haystack.indexOf(needle)
  while (index !== -1) {
    count += 1
    index = haystack.indexOf(needle, index + needle.length)
  }
  return count
}

/**
 * Runs a drill's command (a Node entry file and its arguments, from the
 * manifest in this repository) with the current Node binary and no shell.
 */
function runCommand(command) {
  const result = spawnSync(process.execPath, command, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: COMMAND_TIMEOUT_MS,
    env: { ...process.env, FORCE_COLOR: '0' },
  })
  if (result.error !== undefined) {
    throw result.error
  }
  // tsc colours its output even when told not to, which splits "error" from
  // its code with escape sequences; the failure patterns match plain text.
  return {
    status: result.status ?? 1,
    output: stripVTControlCharacters(`${result.stdout}\n${result.stderr}`),
  }
}

async function drill(entry) {
  const original = await readFile(entry.file, 'utf8')
  const occurrences = countOccurrences(original, entry.find)
  if (occurrences !== 1) {
    throw new Error(
      `${entry.name}: expected the fragment once in ${entry.file}, found ${String(occurrences)}; the drill is stale`,
    )
  }
  const started = Date.now()
  const at = original.indexOf(entry.find)
  const mutated = original.slice(0, at) + entry.replace + original.slice(at + entry.find.length)
  let outcome
  try {
    await writeFile(entry.file, mutated)
    outcome = runCommand(entry.command)
  } finally {
    await writeFile(entry.file, original)
  }
  const restored = await readFile(entry.file, 'utf8')
  if (restored !== original) {
    throw new Error(`${entry.name}: ${entry.file} was not restored`)
  }
  const { status, output } = outcome
  if (status !== 0 && !entry.failure.test(output)) {
    // Non-zero without the runner's failure line: the command broke, which
    // proves nothing about the test. Surface it instead of counting it red.
    console.error(output.split('\n').slice(-30).join('\n'))
    throw new Error(`${entry.name}: the command errored instead of failing its test`)
  }
  const isRed = status !== 0
  const seconds = ((Date.now() - started) / 1000).toFixed(0)
  console.info(`${isRed ? 'red     ' : 'SURVIVED'}  ${entry.name} (${seconds}s)`)
  if (!isRed) {
    console.info(output.split('\n').slice(-30).join('\n'))
  }
  return { ...entry, isRed, seconds }
}

const results = []
for (const entry of selected) {
  results.push(await drill(entry))
}

const survivors = results.filter((result) => !result.isRed)
const lines = [
  `# Red drill ${localDate()}`,
  '',
  `${String(results.length - survivors.length)} of ${String(results.length)} drills went red.`,
  '',
  '| Drill | File | Command | Result |',
  '| --- | --- | --- | --- |',
  ...results.map(
    (result) =>
      `| ${result.name} | \`${result.file}\` | \`${describeCommand(result.command)}\` | ${result.isRed ? 'red' : '**survived**'} (${result.seconds}s) |`,
  ),
]
await mkdir(REPORT_DIR, { recursive: true })
const reportPath = path.join(REPORT_DIR, `${localDate()}.md`)
await writeFile(reportPath, `${lines.join('\n')}\n`)
console.info(`report written to ${reportPath}`)
if (survivors.length > 0) {
  console.error(
    `${String(survivors.length)} drill(s) survived: ${survivors.map((s) => s.name).join('; ')}`,
  )
  process.exitCode = 1
}
