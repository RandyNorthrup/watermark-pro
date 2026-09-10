import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Launcher } from 'chrome-launcher'

import { classifyChromeStartup, launchAuditChrome } from './lib/audit-chrome.mjs'

const options = {
  userDataDir: '/owned/project/profile',
  chromePath: '/pinned/playwright/chrome',
  chromeFlags: ['--headless=new', '--ignore-certificate-errors-spki-list=fixture-key'],
}
const trusted = { isFile: () => true, uid: 0, mode: 0o10_4755 }

test('Linux uses only a verified existing helper while preserving pinned browser and normal flags', async () => {
  let configured
  const browser = { port: 1234 }
  assert.equal(
    await launchAuditChrome(options, {
      platform: 'linux',
      metadata: async () => trusted,
      launch: async (input) => {
        configured = input
        return browser
      },
    }),
    browser,
  )
  assert.equal(configured.chromePath, options.chromePath)
  assert.equal(configured.userDataDir, options.userDataDir)
  assert.equal(configured.ignoreDefaultFlags, true)
  assert.deepEqual(configured.chromeFlags, [...Launcher.defaultFlags(), ...options.chromeFlags])
  assert.equal(configured.chromeFlags.includes('--disable-setuid-sandbox'), false)
  assert.equal(configured.chromeFlags.includes('--no-sandbox'), false)
  assert.equal(configured.envVars.CHROME_DEVEL_SANDBOX, '/opt/google/chrome/chrome-sandbox')
})

test('unavailable, unprivileged, writable, non-executable and non-file helpers never enable setuid', async () => {
  for (const metadata of [
    undefined,
    { ...trusted, uid: 1000 },
    { ...trusted, mode: 0o10_0755 },
    { ...trusted, mode: 0o10_4777 },
    { ...trusted, mode: 0o10_4644 },
    { ...trusted, isFile: () => false },
  ]) {
    let configured
    await launchAuditChrome(options, {
      platform: 'linux',
      metadata: async () => metadata,
      launch: async (input) => {
        configured = input
      },
    })
    assert.equal(configured.ignoreDefaultFlags, undefined)
    assert.deepEqual(configured.chromeFlags, options.chromeFlags)
    assert.equal(configured.envVars, undefined)
  }
  let configured
  await launchAuditChrome(options, {
    platform: 'win32',
    metadata: () => assert.fail('Other platforms must not inspect the Linux helper'),
    launch: async (input) => {
      configured = input
    },
  })
  assert.deepEqual(configured.chromeFlags, options.chromeFlags)
})

test('failed launch closes its owned instance and exposes only finite stderr classification', async () => {
  let isStopped = false
  await assert.rejects(
    launchAuditChrome(options, {
      platform: 'linux',
      metadata: async () => {
        throw new Error('Unavailable fixture helper')
      },
      launch: async () => {
        throw new Error('Private command details must not escape')
      },
      stderr: async () => 'No usable sandbox! private-secret-url',
      killAll: () => {
        isStopped = true
        return []
      },
    }),
    { message: 'Audit Chrome startup failed: sandbox-unavailable; sandbox=platform-default.' },
  )
  assert.equal(isStopped, true)
  assert.equal(classifyChromeStartup('arbitrary private text'), 'unclassified-browser-exit')
  assert.equal(classifyChromeStartup(''), 'stderr-unavailable')
  assert.equal(
    classifyChromeStartup('error while loading shared libraries: libX.so'),
    'missing-shared-library',
  )
})
