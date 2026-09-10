/** Keep the pinned audit browser sandboxed and report startup failures without raw browser logs. */
import { lstat, readFile } from 'node:fs/promises'
import path from 'node:path'

import { killAll, launch, Launcher } from 'chrome-launcher'

const SANDBOX_HELPER = '/opt/google/chrome/chrome-sandbox'
const SETUID_AND_EXECUTABLE = 0o4111
const GROUP_OR_WORLD_WRITE = 0o022

/** Only the image's existing root-owned, setuid, executable regular file may supply the sandbox. */
function isTrustedHelper(metadata) {
  return (
    metadata?.isFile() === true &&
    metadata.uid === 0 &&
    (metadata.mode & SETUID_AND_EXECUTABLE) === SETUID_AND_EXECUTABLE &&
    (metadata.mode & GROUP_OR_WORLD_WRITE) === 0
  )
}

/** Return a finite reason; stderr may contain paths, arguments or private navigation details. */
export function classifyChromeStartup(stderr) {
  if (
    /No usable sandbox|Failed to move to new namespace|namespace_sandbox.*Operation not permitted/i.test(
      stderr,
    )
  )
    return 'sandbox-unavailable'
  if (/error while loading shared libraries|cannot open shared object file/i.test(stderr))
    return 'missing-shared-library'
  if (/Missing X server|\$DISPLAY/.test(stderr)) return 'display-unavailable'
  if (/chrome_crashpad_handler: --database is required/.test(stderr)) return 'profile-unavailable'
  return stderr === '' ? 'stderr-unavailable' : 'unclassified-browser-exit'
}

/** Preserve launcher defaults except its Linux setuid prohibition when a trusted helper exists. */
export async function launchAuditChrome(options, overrides = {}) {
  if (typeof options.userDataDir !== 'string')
    throw new Error('The audit browser requires an explicit owned profile directory.')
  const system = {
    platform: process.platform,
    metadata: () => lstat(SANDBOX_HELPER),
    stderr: () => readFile(path.join(options.userDataDir, 'chrome-err.log'), 'utf8'),
    launch,
    killAll,
    ...overrides,
  }
  let sandbox = 'platform-default'
  let configured = { ...options, logLevel: 'silent' }
  if (system.platform === 'linux') {
    let metadata
    try {
      metadata = await system.metadata()
    } catch {
      // A host without this optional helper retains Chrome's ordinary namespace sandbox.
    }
    if (isTrustedHelper(metadata)) {
      sandbox = 'verified-setuid-helper'
      configured = {
        ...configured,
        // chrome-launcher otherwise appends --disable-setuid-sandbox on Linux.
        // Copy its exact normal defaults, while retaining automatic port/profile arguments.
        ignoreDefaultFlags: true,
        chromeFlags: [...Launcher.defaultFlags(), ...(options.chromeFlags ?? [])],
        envVars: { ...process.env, ...options.envVars, CHROME_DEVEL_SANDBOX: SANDBOX_HELPER },
      }
    }
  }
  console.info(`Audit Chrome sandbox: ${sandbox}.`)
  try {
    return await system.launch(configured)
  } catch {
    let stderr = ''
    try {
      stderr = await system.stderr()
    } catch {
      // Startup can fail before Chrome creates its log; report that finite state.
    }
    const reason = classifyChromeStartup(stderr)
    // The launcher records only instances created by this Node process. Its failed
    // launch has not returned a kill handle to the caller, so close that owned instance here.
    if (system.killAll().length > 0) console.error('Audit Chrome startup cleanup failed.')
    throw new Error(`Audit Chrome startup failed: ${reason}; sandbox=${sandbox}.`)
  }
}
