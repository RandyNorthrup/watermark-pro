import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { zipSync } from 'fflate'

import { auditPublication } from './lib/publication-audit.mjs'
import {
  isRetiredHistoryFinding,
  maskRetiredHistoricalSecrets,
} from './lib/retired-publication-secrets.mjs'
import {
  configuredSecretPatterns,
  findConfiguredSecrets,
  forbiddenPublicationPath,
  inspectZip,
  isZip,
  PUBLICATION_LIMITS,
  safePublicationPath,
} from './publication-policy.mjs'

const repository = path.resolve(import.meta.dirname, '..')
const encoder = new TextEncoder()
function zip(entries) {
  const encoded = Object.entries(entries).map(([name, value]) => [
    name,
    typeof value === 'string' ? encoder.encode(value) : value,
  ])
  return Buffer.from(zipSync(Object.fromEntries(encoded)))
}
function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  assert.equal(result.status, 0, 'Fixture Git operation failed')
  return result.stdout
}
async function fixture(run) {
  const base = await realpath(os.tmpdir())
  const directory = await mkdtemp(path.join(base, 'lumafoil-publication-test-'))
  try {
    git(directory, ['init', '--quiet', '--initial-branch=main'])
    git(directory, ['config', 'user.name', 'Publication Test'])
    git(directory, ['config', 'user.email', 'publication@example.test'])
    await copyFile(path.join(repository, '.gitleaks.toml'), path.join(directory, '.gitleaks.toml'))
    await writeFile(path.join(directory, '.gitignore'), 'temp/\n.dev.vars\n.env\n')
    await mkdir(path.join(directory, 'src'))
    await writeFile(
      path.join(directory, 'src', 'sample.browser.test.ts'),
      'export const sample = true\n',
    )
    git(directory, ['add', '.'])
    git(directory, ['commit', '--quiet', '-m', 'test: establish clean publication fixture'])
    await run(directory)
  } finally {
    const actual = await realpath(directory)
    assert.equal(path.dirname(actual), base)
    assert.ok(path.basename(actual).startsWith('lumafoil-publication-test-'))
    await rm(actual, { recursive: true, force: true })
  }
}
function scannerCanary() {
  return 'test_' + randomBytes(32).toString('hex')
}

function googleCanary() {
  return 'AIza' + randomBytes(27).toString('base64url').slice(0, 35)
}

function retiredFixture(value) {
  return {
    sha256: createHash('sha256').update(value).digest('hex'),
    commit: 'a'.repeat(40),
    file: 'historic-config.json',
    rule: 'gcp-api-key',
    line: 7,
  }
}

test('retired digest masking is history-blob-only, preserves unrelated bytes and never mutates original inputs', () => {
  const retired = googleCanary()
  const other = googleCanary()
  const registry = [retiredFixture(retired)]
  const original = Buffer.concat([
    Buffer.from([0, 0xff, 0x80]),
    Buffer.from(
      `old='${retired}'\nother='${other}'\nrepeat='${retired}'\nlonger='${retired}suffix'`,
    ),
  ])
  const snapshot = Buffer.from(original)
  const masked = maskRetiredHistoricalSecrets(original, 'history-blob', registry)
  assert.equal(masked.occurrences, 2)
  assert.equal(masked.bytes.length, original.length)
  assert.deepEqual(masked.bytes.subarray(0, 3), Buffer.from([0, 0xff, 0x80]))
  assert.ok(masked.bytes.includes(Buffer.from(`other='${other}'`)))
  assert.ok(masked.bytes.includes(Buffer.from(`longer='${retired}suffix'`)))
  const hidden = '*'.repeat(retired.length)
  assert.ok(masked.bytes.includes(Buffer.from(`old='${hidden}'`)))
  assert.deepEqual(original, snapshot)
  const patterns = configuredSecretPatterns([{ name: 'GOOGLE_PICKER_API_KEY', value: retired }])
  assert.deepEqual(findConfiguredSecrets(original, patterns), ['GOOGLE_PICKER_API_KEY'])
  for (const scope of ['working', 'index', 'build', 'current', 'history', 'history-metadata']) {
    const current = maskRetiredHistoricalSecrets(original, scope, registry)
    assert.equal(current.occurrences, 0)
    assert.strictEqual(current.bytes, original)
  }
  assert.equal(maskRetiredHistoricalSecrets(original, 'history-blob').occurrences, 0)
})

test('history finding exception requires the exact commit, path, rule, line and fingerprint together', () => {
  const retired = retiredFixture(googleCanary())
  const finding = {
    Commit: retired.commit,
    File: retired.file,
    RuleID: retired.rule,
    StartLine: retired.line,
    Fingerprint: `${retired.commit}:${retired.file}:${retired.rule}:${retired.line}`,
  }
  assert.equal(isRetiredHistoryFinding(finding, 'history', [retired]), true)
  for (const scope of ['candidate', 'working', 'index', 'build', 'history-blob'])
    assert.equal(isRetiredHistoryFinding(finding, scope, [retired]), false)
  for (const [field, value] of [
    ['Commit', 'b'.repeat(40)],
    ['File', 'other-config.json'],
    ['RuleID', 'generic-api-key'],
    ['StartLine', retired.line + 1],
    ['Fingerprint', `${finding.Fingerprint}:extra`],
    ['Fingerprint', undefined],
  ])
    assert.equal(
      isRetiredHistoryFinding({ ...finding, [field]: value }, 'history', [retired]),
      false,
    )
  assert.equal(isRetiredHistoryFinding(finding, 'history'), false)
  const known = {
    Commit: '730aee4f9e5f96dcadeee227db5bb95d24addf46',
    File: 'wrangler.jsonc',
    RuleID: 'gcp-api-key',
    StartLine: 120,
    Fingerprint: '730aee4f9e5f96dcadeee227db5bb95d24addf46:wrangler.jsonc:gcp-api-key:120',
  }
  assert.equal(isRetiredHistoryFinding(known, 'history'), true)
  assert.equal(isRetiredHistoryFinding(known, 'candidate'), false)
})

test('historical ZIP scan copies preserve original CRC and configured-secret inspection', () => {
  const retired = googleCanary()
  const registry = [retiredFixture(retired)]
  const member = `\n${retired}\n`
  const original = Buffer.from(zipSync({ 'retired.txt': encoder.encode(member) }, { level: 0 }))
  const snapshot = Buffer.from(original)
  const entries = inspectZip(original).entries
  const patterns = configuredSecretPatterns([{ name: 'GOOGLE_PICKER_API_KEY', value: retired }])
  assert.deepEqual(findConfiguredSecrets(original, patterns), ['GOOGLE_PICKER_API_KEY'])
  assert.deepEqual(findConfiguredSecrets(entries[0].bytes, patterns), ['GOOGLE_PICKER_API_KEY'])
  const archiveCopy = maskRetiredHistoricalSecrets(original, 'history-blob', registry)
  assert.equal(archiveCopy.occurrences, 1)
  assert.throws(() => inspectZip(archiveCopy.bytes), /CRC/)
  const entryCopy = maskRetiredHistoricalSecrets(entries[0].bytes, 'history-blob', registry)
  assert.equal(entryCopy.occurrences, 1)
  assert.equal(entryCopy.bytes.includes(Buffer.from(retired)), false)
  assert.deepEqual(findConfiguredSecrets(entryCopy.bytes, patterns), [])
  assert.deepEqual(original, snapshot)
  assert.equal(inspectZip(original).entries[0].bytes.toString(), member)
})

test('only canonical empty environment examples are path-permitted; private files and aliases are rejected', () => {
  assert.equal(forbiddenPublicationPath('.env.example'), null)
  assert.equal(forbiddenPublicationPath('.dev.vars.example'), null)
  assert.equal(forbiddenPublicationPath('src/example.browser.test.ts'), null)
  for (const filename of [
    '.env',
    '.env.production',
    '.dev.vars',
    '.wrangler/config.json',
    'temp/creds.md',
    'client_secret_export.json',
    'account.pfx',
    '__pycache__/private.cpython-314.pyc',
    'generated.pyc',
  ])
    assert.ok(forbiddenPublicationPath(filename))
  for (const filename of [
    '../outside',
    '/absolute',
    String.raw`C:\secret`,
    'image.txt:private',
    'dir/../secret',
    'dir/.. /secret',
    'NUL.txt',
  ])
    assert.throws(() => safePublicationPath(filename))
})
test('private-value comparison covers common encodings without treating a source filename as Brotli', () => {
  const secret = randomBytes(32).toString('base64url')
  const patterns = configuredSecretPatterns([{ name: 'BETTER_AUTH_SECRET', value: secret }])
  for (const value of [
    Buffer.from(secret),
    Buffer.from(secret, 'utf16le'),
    Buffer.from(Buffer.from(secret).toString('base64')),
    Buffer.from(Buffer.from(secret).toString('hex')),
  ])
    assert.deepEqual(findConfiguredSecrets(value, patterns), ['BETTER_AUTH_SECRET'])
  assert.deepEqual(findConfiguredSecrets(Buffer.from('safe unrelated source'), patterns), [])
  assert.equal(isZip(Buffer.from('export const value = true'), 'sample.browser.test.ts'), false)
  assert.throws(
    () => isZip(Buffer.from([0x1f, 0x8b, 0, 0]), 'disguised.txt'),
    /Unsupported archive/,
  )
})
test('ZIP inspection checks real bytes, rejects traversal and CRC tampering, and enforces size and ratio limits', () => {
  const data = zip({ 'nested/example.browser.test.ts': 'export const value = true' })
  const extracted = inspectZip(data)
  assert.equal(extracted.entries[0].path, 'nested/example.browser.test.ts')
  assert.equal(extracted.entries[0].bytes.toString(), 'export const value = true')
  assert.throws(() => inspectZip(zip({ '../private.env': 'secret' })), /Unsafe/)
  assert.throws(() => inspectZip(zip({ 'NUL.txt': 'secret' })), /Unsafe/)
  assert.throws(() => inspectZip(data, { ...PUBLICATION_LIMITS, entryBytes: 1 }), /expansion limit/)
  assert.throws(
    () => inspectZip(zip({ 'bomb.txt': 'a'.repeat(50_000) }), { ...PUBLICATION_LIMITS, ratio: 2 }),
    /expansion limit/,
  )
  const corrupted = Buffer.from(data)
  const central = corrupted.indexOf(Buffer.from('504b0102', 'hex'))
  corrupted.writeUInt32LE(0, central + 16)
  assert.throws(() => inspectZip(corrupted), /CRC/)
})
test('ZIP local size mismatches, encrypted entries, links, and duplicate names cannot be silently skipped', () => {
  const data = zip({ 'source.txt': 'safe source' })
  const central = data.indexOf(Buffer.from('504b0102', 'hex'))
  const encrypted = Buffer.from(data)
  encrypted.writeUInt16LE(1, central + 8)
  assert.throws(() => inspectZip(encrypted), /Encrypted/)
  const link = Buffer.from(data)
  link.writeUInt32LE(0xa0_00_00_00, central + 38)
  assert.throws(() => inspectZip(link), /links or special/)
  const mismatch = Buffer.from(data)
  mismatch.writeUInt32LE(1, central + 24)
  assert.throws(() => inspectZip(mismatch), /local sizes|actual|Actual/)
  assert.throws(() => inspectZip(zip({ 'Same.txt': 'a', 'same.txt': 'b' })), /Duplicate/)
})

test('real candidate scan is green, red for a staged private value hidden by a clean working copy, then green after exact restoration', async () => {
  await fixture(async (root) => {
    const filename = path.join(root, 'src', 'sample.browser.test.ts')
    const original = await readFile(filename)
    const secret = randomBytes(36).toString('base64url')
    await writeFile(path.join(root, '.dev.vars'), `BETTER_AUTH_SECRET=${secret}\n`)
    const green = await auditPublication(root)
    assert.equal(green.status, 'pass')
    await writeFile(filename, `export const retainedValue = '${secret}'\n`)
    git(root, ['add', 'src/sample.browser.test.ts'])
    await writeFile(filename, original)
    const red = await auditPublication(root)
    assert.equal(red.status, 'fail')
    assert.ok(
      red.findings.some(
        (finding) => finding.check === 'configured-secret' && finding.path.startsWith('index:'),
      ),
    )
    assert.equal(JSON.stringify(red).includes(secret), false)
    git(root, ['add', 'src/sample.browser.test.ts'])
    const restored = await auditPublication(root)
    assert.equal(restored.status, 'pass')
  })
})
test('real Gitleaks scans browser-test source and historical ZIP members after the unsafe current archive was removed', async () => {
  await fixture(async (root) => {
    const canary = scannerCanary()
    const archive = zip({ 'code.browser.test.ts': `export const serviceApiKey = '${canary}'\n` })
    await writeFile(path.join(root, 'example.zip'), archive)
    git(root, ['add', 'example.zip'])
    git(root, ['commit', '--quiet', '-m', 'test: retain unsafe archive history for scanner proof'])
    await rm(path.join(root, 'example.zip'))
    git(root, ['add', '-u'])
    git(root, ['commit', '--quiet', '-m', 'test: current tree alone is insufficient'])
    const result = await auditPublication(root)
    assert.equal(result.status, 'fail')
    assert.ok(
      result.findings.some(
        (finding) =>
          finding.check === 'gitleaks' &&
          finding.path.includes('history:') &&
          finding.path.includes('code.browser.test.ts'),
      ),
    )
    assert.equal(JSON.stringify(result).includes(canary), false)
  })
})
test('forced private configuration and fourth-level ZIP nesting fail without depending on secret pattern matches', async () => {
  await fixture(async (root) => {
    await writeFile(path.join(root, '.dev.vars'), 'PUBLIC_SETTING=yes\n')
    git(root, ['add', '-f', '.dev.vars'])
    let nested = zip({ 'safe.txt': 'safe' })
    for (let depth = 0; depth < PUBLICATION_LIMITS.depth; depth += 1)
      nested = zip({ 'nested.zip': nested })
    await writeFile(path.join(root, 'nested.zip'), nested)
    const result = await auditPublication(root)
    assert.equal(result.status, 'fail')
    assert.ok(
      result.findings.some(
        (finding) => finding.check === 'path' && finding.path.includes('.dev.vars'),
      ),
    )
    assert.ok(
      result.findings.some(
        (finding) => finding.check === 'archive' && finding.reason.includes('depth'),
      ),
    )
  })
})

test('generic browser-test canary is red without a configured value and clears after restoration', async () => {
  await fixture(async (root) => {
    const filename = path.join(root, 'src', 'sample.browser.test.ts')
    const original = await readFile(filename)
    const canary = scannerCanary()
    await writeFile(filename, `export const serviceApiKey = '${canary}'\n`)
    const red = await auditPublication(root)
    assert.equal(red.status, 'fail')
    assert.ok(
      red.findings.some(
        (finding) =>
          finding.check === 'gitleaks' && finding.path === 'working:src/sample.browser.test.ts',
      ),
    )
    assert.equal(JSON.stringify(red).includes(canary), false)
    await writeFile(filename, original)
    const restored = await auditPublication(root)
    assert.equal(restored.status, 'pass')
  })
})

test('built output checks binary configured-value leaks and generic ZIP metadata canaries', async () => {
  await fixture(async (root) => {
    const built = path.join(root, 'dist', 'client')
    await mkdir(built, { recursive: true })
    await writeFile(path.join(built, 'index.html'), '<h1>Safe build</h1>')
    const secret = randomBytes(32).toString('base64url')
    await writeFile(path.join(root, '.dev.vars'), `BETTER_AUTH_SECRET=${secret}\n`)
    const green = await auditPublication(root, 'built')
    assert.equal(green.status, 'pass')
    const binary = Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(secret, 'utf16le')])
    await writeFile(path.join(built, 'image.png'), binary)
    const red = await auditPublication(root, 'built')
    assert.ok(
      red.findings.some(
        (finding) => finding.check === 'configured-secret' && finding.path === 'build:image.png',
      ),
    )
    assert.equal(JSON.stringify(red).includes(secret), false)
    await rm(path.join(built, 'image.png'))
    const canary = scannerCanary()
    const archive = Buffer.from(
      zipSync({ 'safe.txt': encoder.encode('safe') }, { comment: `serviceApiKey = '${canary}'` }),
    )
    await writeFile(path.join(built, 'download.zip'), archive)
    const metadata = await auditPublication(root, 'built')
    assert.ok(
      metadata.findings.some(
        (finding) => finding.check === 'gitleaks' && finding.path.includes('ZIP metadata'),
      ),
    )
    assert.equal(JSON.stringify(metadata).includes(canary), false)
    await rm(path.join(built, 'download.zip'))
    const restored = await auditPublication(root, 'built')
    assert.equal(restored.status, 'pass')
  })
})

test('Google-shaped keys remain blocked in working, index and built copies with no retired exception', async () => {
  await fixture(async (root) => {
    const filename = path.join(root, 'src', 'sample.browser.test.ts')
    const original = await readFile(filename)
    const key = googleCanary()
    const payload = `export const pickerKey = '${key}'\n`
    await writeFile(filename, payload)
    const working = await auditPublication(root)
    assert.equal(working.status, 'fail')
    assert.ok(
      working.findings.some(
        (finding) =>
          finding.check === 'gitleaks' &&
          finding.rule === 'gcp-api-key' &&
          finding.path.startsWith('working:'),
      ),
    )
    assert.equal(working.stats.retiredHistoryMaskedOccurrences, 0)
    git(root, ['add', 'src/sample.browser.test.ts'])
    await writeFile(filename, original)
    const index = await auditPublication(root)
    assert.equal(index.status, 'fail')
    assert.ok(
      index.findings.some(
        (finding) =>
          finding.check === 'gitleaks' &&
          finding.rule === 'gcp-api-key' &&
          finding.path.startsWith('index:'),
      ),
    )
    const built = path.join(root, 'dist', 'client')
    await mkdir(built, { recursive: true })
    await writeFile(path.join(built, 'runtime.js'), payload)
    const served = await auditPublication(root, 'built')
    assert.equal(served.status, 'fail')
    assert.ok(
      served.findings.some(
        (finding) =>
          finding.check === 'gitleaks' &&
          finding.rule === 'gcp-api-key' &&
          finding.path === 'build:runtime.js',
      ),
    )
    assert.equal(served.stats.retiredHistoryMaskedOccurrences, 0)
    assert.equal(served.stats.retiredHistoryFindings, 0)
    await writeFile(path.join(root, '.dev.vars'), `GOOGLE_PICKER_API_KEY=${key}\n`)
    const configured = await auditPublication(root, 'built')
    assert.ok(
      configured.findings.some(
        (finding) =>
          finding.check === 'configured-secret' && finding.name === 'GOOGLE_PICKER_API_KEY',
      ),
    )
    for (const result of [working, index, served, configured])
      assert.equal(JSON.stringify(result).includes(key), false)
  })
})

test('an arbitrary exact .gitleaksignore fingerprint cannot authorize another historical Google key', async () => {
  await fixture(async (root) => {
    const key = googleCanary()
    const filename = path.join(root, 'historic-config.json')
    await writeFile(filename, JSON.stringify({ apiKey: key }) + '\n')
    git(root, ['add', 'historic-config.json'])
    git(root, ['commit', '--quiet', '-m', 'test: establish unrelated secret history'])
    const commit = git(root, ['rev-parse', 'HEAD']).trim()
    await writeFile(
      path.join(root, '.gitleaksignore'),
      `${commit}:historic-config.json:gcp-api-key:1\n`,
    )
    await rm(filename)
    git(root, ['add', '-u'])
    git(root, ['commit', '--quiet', '-m', 'test: remove current key without changing history'])
    const result = await auditPublication(root)
    assert.equal(result.status, 'fail')
    assert.ok(
      result.findings.some(
        (finding) =>
          finding.check === 'gitleaks' &&
          finding.rule === 'gcp-api-key' &&
          finding.path === 'history:historic-config.json',
      ),
    )
    assert.equal(result.stats.retiredHistoryMaskedOccurrences, 0)
    assert.equal(result.stats.retiredHistoryFindings, 0)
    assert.equal(JSON.stringify(result).includes(key), false)
  })
})

test('unexpected ignore files inside Git metadata fail closed instead of suppressing history findings', async () => {
  await fixture(async (root) => {
    await writeFile(path.join(root, '.git', '.gitleaksignore'), 'untrusted-history-suppression\n')
    await assert.rejects(
      auditPublication(root),
      /Git metadata contains an unexpected scanner ignore file/,
    )
  })
})
