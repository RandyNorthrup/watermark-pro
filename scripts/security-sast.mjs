#!/usr/bin/env node
/** Invoke the installed Semgrep entry point without constructing an executable path. */
import { spawnSync } from 'node:child_process'

const PYTHON_ENTRY = 'from semgrep.console_scripts.pysemgrep import main; main()'
const SCAN_ARGS = [
  'scan',
  '--config',
  'p/default',
  '--config',
  'p/typescript',
  '--config',
  'p/react',
  '--config',
  'p/secrets',
  '--error',
  '--metrics=off',
]
const version = spawnSync('semgrep', ['--version'], { stdio: 'ignore', windowsHide: true })
let result
if (version.status === 0) {
  result = spawnSync('semgrep', SCAN_ARGS, { stdio: 'inherit', windowsHide: true })
} else {
  // Python user installs on Windows need not add their Scripts directory to PATH.
  // Invoke the package's actual console entry point, not deprecated python -m semgrep.
  const python = spawnSync('python', ['-c', PYTHON_ENTRY, '--version'], {
    stdio: 'ignore',
    windowsHide: true,
  })
  if (python.status !== 0)
    throw new Error(
      'Semgrep is required. Install it from https://semgrep.dev/docs/getting-started/ and rerun npm run security:sast.',
    )
  result = spawnSync('python', ['-c', PYTHON_ENTRY, ...SCAN_ARGS], {
    stdio: 'inherit',
    windowsHide: true,
  })
}
if (result.error !== undefined) throw result.error
process.exitCode = result.status ?? 1
