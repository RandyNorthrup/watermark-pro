/** Audit what Git can publish and what the browser build can serve; never print private values. */
import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseEnv } from 'node:util'

import {
  isRetiredHistoryFinding,
  maskRetiredHistoricalSecrets,
} from './retired-publication-secrets.mjs'
import {
  configuredSecretPatterns,
  findConfiguredSecrets,
  forbiddenPublicationPath,
  inspectZip,
  isZip,
  PUBLICATION_LIMITS,
  safePublicationPath,
} from '../publication-policy.mjs'

const SECRET_NAME =
  /(?:^|_)(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY|SIGNING_KEY|SESSION_KEY|COOKIE_KEY)(?:_|$)/
const SECRET_KEYS = new Set(['CLOUDFLARE_API_KEY', 'GOOGLE_PICKER_API_KEY'])
const GIT_OUTPUT_LIMIT = PUBLICATION_LIMITS.candidateBytes
const TOOL_TIMEOUT_MS = 120_000
const ENV_EXAMPLES = new Set(['.env.example', '.dev.vars.example'])
const LFS_PREFIX = 'version https://git-lfs.github.com/spec/v1'

function isPrivateVariable(name) {
  return SECRET_NAME.test(name) || SECRET_KEYS.has(name)
}
function childEnvironment() {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !isPrivateVariable(name) && !name.startsWith('GITLEAKS_'),
    ),
  )
}
function git(root, args, input) {
  const result = spawnSync('git', args, {
    cwd: root,
    input,
    maxBuffer: GIT_OUTPUT_LIMIT,
    timeout: TOOL_TIMEOUT_MS,
    env: childEnvironment(),
  })
  if (result.error !== undefined || result.status !== 0)
    throw new Error('Git candidate enumeration or object read failed')
  return result.stdout
}
function inside(root, filename) {
  const relative = path.relative(root, filename)
  return (
    relative !== '' &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== '..' &&
    !path.isAbsolute(relative)
  )
}
async function configuredSecrets(root) {
  const values = []
  for (const [name, value] of Object.entries(process.env))
    if (value !== undefined && value !== '' && isPrivateVariable(name)) values.push({ name, value })
  const rootEntries = await readdir(root, { withFileTypes: true })
  for (const entry of rootEntries) {
    if (
      !entry.isFile() ||
      ENV_EXAMPLES.has(entry.name) ||
      !/^\.(?:env|dev\.vars)(?:\..*)?$/.test(entry.name)
    )
      continue
    const info = await lstat(path.join(root, entry.name))
    if (info.size > PUBLICATION_LIMITS.fileBytes)
      throw new Error('Private configuration exceeds its read limit')
    const contents = parseEnv(await readFile(path.join(root, entry.name), 'utf8'))
    for (const [name, value] of Object.entries(contents))
      if (value !== '' && isPrivateVariable(name)) values.push({ name, value })
  }
  return values.filter(
    (item, index) =>
      values.findIndex((other) => other.name === item.name && other.value === item.value) === index,
  )
}

function indexEntries(root) {
  return git(root, ['ls-files', '--stage', '-z'])
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const match = /^(\d+) ([a-f\d]+) (\d)\t([\s\S]+)$/.exec(line)
      if (match === null || match[3] !== '0')
        throw new Error('Unmerged or unrecognized Git index entry')
      return { mode: match[1], oid: match[2], path: match[4] }
    })
}
function historyObjects(root) {
  const references = git(root, ['rev-list', '--objects', '--all'])
    .toString('utf8')
    .split('\n')
    .filter(Boolean)
  return references.map((line) => {
    const separator = line.indexOf(' ')
    const oid = separator === -1 ? line : line.slice(0, separator)
    if (!/^[a-f\d]{40,64}$/.test(oid)) throw new Error('Unrecognized Git history object ID')
    return { oid, path: separator === -1 ? '' : line.slice(separator + 1) }
  })
}
function readObjects(root, requested) {
  const objects = [...new Set(requested.map((item) => item.oid))]
  if (objects.length === 0) return new Map()
  const input = `${objects.join('\n')}\n`
  const checks = git(
    root,
    ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'],
    input,
  )
    .toString('utf8')
    .trim()
    .split('\n')
  let size = 0
  const selected = checks.map((line) => {
    const [oid, type, count] = line.split(' ', 3)
    const bytes = Number(count)
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('Invalid Git object size')
    if (!['blob', 'commit', 'tag', 'tree'].includes(type))
      throw new Error('Unsupported Git object type')
    size += bytes
    if (bytes > PUBLICATION_LIMITS.fileBytes || size > PUBLICATION_LIMITS.candidateBytes)
      throw new Error('Git publication candidates exceed the configured byte limits')
    return { oid, type }
  })
  if (selected.length === 0) return new Map()
  const data = git(
    root,
    ['cat-file', '--batch'],
    `${selected.map((item) => item.oid).join('\n')}\n`,
  )
  const result = new Map()
  let offset = 0
  for (const expected of selected) {
    const { oid } = expected
    const newline = data.indexOf('\n', offset)
    if (newline === -1) throw new Error('Incomplete Git object stream')
    const [actual, type, count] = data.subarray(offset, newline).toString().split(' ', 3)
    const length = Number(count)
    const end = newline + 1 + length
    if (
      actual !== oid ||
      type !== expected.type ||
      !Number.isSafeInteger(length) ||
      end >= data.length ||
      data[end] !== 10
    )
      throw new Error('Invalid Git object stream')
    result.set(oid, { type, bytes: data.subarray(newline + 1, end) })
    offset = end + 1
  }
  if (offset !== data.length) throw new Error('Uninspected trailing Git object data')
  return result
}

async function builtFiles(root) {
  const directory = path.join(root, 'dist', 'client')
  const actual = await realpath(directory)
  if (!inside(await realpath(root), actual))
    throw new Error('Public build directory escapes the workspace')
  const files = []
  async function visit(current, relative = '') {
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const name = relative === '' ? entry.name : `${relative}/${entry.name}`
      if (entry.isSymbolicLink()) throw new Error('Public build contains a link')
      if (entry.isDirectory()) await visit(path.join(current, entry.name), name)
      else files.push({ path: name, absolute: path.join(current, entry.name) })
    }
  }
  await visit(directory)
  if (files.length === 0) throw new Error('Public build contains no files to inspect')
  return files
}

async function historyScannerSource(root) {
  const directory = await realpath(
    git(root, ['rev-parse', '--absolute-git-dir']).toString('utf8').trim(),
  )
  const names = await readdir(directory)
  if (names.some((name) => name.toLowerCase() === '.gitleaksignore'))
    throw new Error('Git metadata contains an unexpected scanner ignore file')
  return directory
}

async function scanWithGitleaks(root, stage, history, sourceMap, reportPath, patterns) {
  const emptyIgnore = path.join(stage, 'empty.gitleaksignore')
  await writeFile(emptyIgnore, '')
  // Gitleaks 8.30.1 always adds <source>/.gitleaksignore even with an explicit
  // ignore path. A Git metadata directory supports the same read-only log scan
  // without inheriting working-tree suppressions; reject metadata-local ones.
  const args = history
    ? ['git', await historyScannerSource(root), '--log-opts=--all --full-history']
    : ['dir', path.join(stage, 'candidate')]
  args.push(
    '--config',
    path.join(root, '.gitleaks.toml'),
    '--redact=100',
    '--no-banner',
    '--ignore-gitleaks-allow',
    '--gitleaks-ignore-path',
    emptyIgnore,
    '--max-archive-depth=0',
    '--max-target-megabytes=0',
    '--report-format=json',
    '--report-path',
    reportPath,
  )
  const result = spawnSync('gitleaks', args, {
    cwd: root,
    timeout: TOOL_TIMEOUT_MS,
    maxBuffer: GIT_OUTPUT_LIMIT,
    env: childEnvironment(),
  })
  if (result.error !== undefined || ![0, 1].includes(result.status))
    throw new Error(
      'Gitleaks could not complete its publication scan; scanner output was withheld to protect private values',
    )
  let findings
  try {
    findings = JSON.parse(await readFile(reportPath, 'utf8'))
  } catch {
    throw new Error('Gitleaks did not produce a readable publication report')
  }
  if (!Array.isArray(findings)) throw new Error('Unexpected Gitleaks report format')
  if (result.status === 1 && findings.length === 0)
    throw new Error('Gitleaks failed without actionable redacted findings')
  const retained = findings.filter(
    (finding) => !isRetiredHistoryFinding(finding, history ? 'history' : 'candidate'),
  )
  return {
    retiredHistoryFindings: findings.length - retained.length,
    findings: retained.map((finding) => {
      const file = typeof finding.File === 'string' ? finding.File : ''
      const relative = path
        .relative(
          path.join(stage, 'candidate'),
          path.isAbsolute(file) ? file : path.resolve(root, file),
        )
        .replaceAll('\\', '/')
      const label = sourceMap.get(relative) ?? (history ? `history:${file}` : 'scanner candidate')
      return {
        check: 'gitleaks',
        path: safeLabel(label, patterns),
        rule: typeof finding.RuleID === 'string' ? safeLabel(finding.RuleID, patterns) : 'unknown',
        line: Number.isSafeInteger(finding.StartLine)
          ? Math.max(1, finding.StartLine - (relative.startsWith('neutral/') ? 1 : 0))
          : 0,
      }
    }),
  }
}
function safeLabel(value, patterns) {
  if (findConfiguredSecrets(Buffer.from(value), patterns).length > 0)
    return '[sensitive path or label]'
  return [...value]
    .map((character) =>
      character.codePointAt(0) < 32 || character.codePointAt(0) === 127 ? '?' : character,
    )
    .join('')
}

/** Source mode audits working files, index snapshots, and reachable history; built mode audits only browser-served output. */
export async function auditPublication(root, mode = 'source') {
  if (!['source', 'built'].includes(mode)) throw new Error('Unsupported publication audit mode')
  root = await realpath(root)
  const secrets = await configuredSecrets(root)
  const patterns = configuredSecretPatterns(secrets)
  const parent = path.join(root, 'temp', 'lumafoil-publication-audit')
  await mkdir(parent, { recursive: true })
  if (!inside(root, await realpath(parent)))
    throw new Error('Publication staging directory escapes the workspace')
  const stage = path.join(parent, `gate-${randomUUID()}`)
  await mkdir(path.join(stage, 'candidate'), { recursive: true })
  const findings = []
  const sourceMap = new Map()
  const seen = new Set()
  const stats = {
    files: 0,
    bytes: 0,
    archiveEntries: 0,
    expandedBytes: 0,
    historyObjects: 0,
    configuredSecrets: secrets.length,
    retiredHistoryMaskedOccurrences: 0,
    retiredHistoryFindings: 0,
  }
  let sequence = 0
  async function inspect(
    bytes,
    label,
    filename,
    depth = 0,
    shouldStage = true,
    shouldInspectArchives = true,
    origin = 'current',
  ) {
    stats.files += 1
    stats.bytes += bytes.length
    if (
      bytes.length > PUBLICATION_LIMITS.fileBytes ||
      stats.bytes > PUBLICATION_LIMITS.candidateBytes
    )
      throw new Error('Publication byte budget exceeded')
    let problem
    try {
      problem = forbiddenPublicationPath(filename)
    } catch {
      problem = 'Unsafe publication path'
    }
    if (problem !== null && problem !== undefined)
      findings.push({ check: 'path', path: safeLabel(label, patterns), reason: problem })
    const names = findConfiguredSecrets(bytes, patterns)
    const pathNames = findConfiguredSecrets(Buffer.from(filename), patterns)
    const secretNames = new Set([...names, ...pathNames])
    for (const name of secretNames)
      findings.push({ check: 'configured-secret', path: safeLabel(label, patterns), name })
    if (bytes.subarray(0, LFS_PREFIX.length).toString() === LFS_PREFIX)
      findings.push({
        check: 'uninspected-content',
        path: safeLabel(label, patterns),
        reason: 'Git LFS content must be materialized and inspected before publication',
      })
    // A masked historical copy must never replace a current candidate with
    // identical original bytes; their scanner treatment is deliberately different.
    const fingerprint = `${origin === 'history-blob' ? 'history' : 'current'}:${createHash('sha256').update(bytes).digest('hex')}`
    if (seen.has(fingerprint)) return
    seen.add(fingerprint)
    if (shouldStage && problem !== 'Unsafe publication path' && names.length === 0) {
      const scannerCopy = maskRetiredHistoricalSecrets(bytes, origin)
      stats.retiredHistoryMaskedOccurrences += scannerCopy.occurrences
      sequence += 1
      const safeName = `${sequence}/${safePublicationPath(filename)}`
      await mkdir(path.dirname(path.join(stage, 'candidate', safeName)), { recursive: true })
      await writeFile(path.join(stage, 'candidate', safeName), scannerCopy.bytes)
      sourceMap.set(safeName, label)
      // Gitleaks can mistake .browser.test.ts for Brotli even with archive
      // decoding disabled. Keep the real path for filename rules and scan an
      // neutral copy with a text prefix so filename and binary magic detection
      // cannot skip source or ZIP metadata. Correct its extra report line below.
      const neutralName = `neutral/${sequence}.txt`
      await mkdir(path.join(stage, 'candidate', 'neutral'), { recursive: true })
      await writeFile(
        path.join(stage, 'candidate', neutralName),
        Buffer.concat([Buffer.from('Publication content\n'), scannerCopy.bytes]),
      )
      sourceMap.set(neutralName, label)
    }
    try {
      if (!shouldInspectArchives || !isZip(bytes, filename)) return
      if (depth >= PUBLICATION_LIMITS.depth) throw new Error('Nested ZIP depth limit exceeded')
      const archive = inspectZip(bytes)
      await inspect(
        archive.metadata,
        `${label}!ZIP metadata`,
        'zip-metadata.txt',
        depth + 1,
        true,
        false,
        origin,
      )
      for (const entry of archive.entries) {
        stats.archiveEntries += 1
        stats.expandedBytes += entry.bytes.length
        if (
          stats.archiveEntries > PUBLICATION_LIMITS.entries ||
          stats.expandedBytes > PUBLICATION_LIMITS.expandedBytes
        )
          throw new Error('Aggregate archive expansion limit exceeded')
        await inspect(
          entry.bytes,
          `${label}!${entry.path}`,
          entry.path,
          depth + 1,
          true,
          true,
          origin,
        )
      }
    } catch (error) {
      findings.push({
        check: 'archive',
        path: safeLabel(label, patterns),
        reason: error instanceof Error ? error.message : 'Archive inspection failed',
      })
    }
  }
  try {
    if (mode === 'built') {
      const files = await builtFiles(root)
      for (const file of files) {
        const info = await lstat(file.absolute)
        if (!info.isFile() || info.size > PUBLICATION_LIMITS.fileBytes)
          throw new Error('Public build contains an unsupported or over-limit file')
        await inspect(await readFile(file.absolute), `build:${file.path}`, file.path)
      }
    } else {
      const index = indexEntries(root)
      const working = git(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
        .toString('utf8')
        .split('\0')
        .filter(Boolean)
      const workingNames = new Set(working)
      for (const filename of workingNames) {
        let safe
        try {
          safe = safePublicationPath(filename)
        } catch {
          findings.push({
            check: 'path',
            path: '[unsafe Git path]',
            reason: 'Non-portable Git path',
          })
          continue
        }
        const absolute = path.join(root, safe)
        let info
        try {
          info = await lstat(absolute)
        } catch (error) {
          if (error?.code === 'ENOENT') continue
          throw new Error('Could not inspect a working candidate', { cause: error })
        }
        if (!info.isFile() || info.isSymbolicLink()) {
          findings.push({
            check: 'path',
            path: safeLabel(filename, patterns),
            reason: 'Links and special files are not publication candidates',
          })
          continue
        }
        if (!inside(root, await realpath(absolute))) {
          findings.push({
            check: 'path',
            path: safeLabel(filename, patterns),
            reason: 'Working candidate resolves outside the workspace',
          })
          continue
        }
        if (info.size > PUBLICATION_LIMITS.fileBytes)
          throw new Error('Working candidate exceeds file-byte limit')
        await inspect(await readFile(absolute), `working:${filename}`, filename)
      }
      const history = historyObjects(root)
      const objects = readObjects(root, [...index, ...history])
      for (const entry of index) {
        if (!['100644', '100755'].includes(entry.mode)) {
          findings.push({
            check: 'path',
            path: safeLabel(`index:${entry.path}`, patterns),
            reason: 'Index links, submodules, and special files are forbidden',
          })
          continue
        }
        const object = objects.get(entry.oid)
        if (object?.type !== 'blob') throw new Error('Index blob was not inspected')
        await inspect(object.bytes, `index:${entry.path}`, entry.path)
      }
      for (const entry of history) {
        const object = objects.get(entry.oid)
        if (object === undefined) continue
        stats.historyObjects += 1
        const filename =
          object.type !== 'blob' || entry.path === '' || entry.path.startsWith('"')
            ? `${object.type}-${entry.oid}.txt`
            : entry.path
        await inspect(
          object.bytes,
          `history:${entry.oid}`,
          filename,
          0,
          object.type !== 'tree',
          true,
          object.type === 'blob' ? 'history-blob' : 'history-metadata',
        )
      }
      if (history.length > 0) {
        const historyScan = await scanWithGitleaks(
          root,
          stage,
          true,
          sourceMap,
          path.join(stage, 'history.json'),
          patterns,
        )
        findings.push(...historyScan.findings)
        stats.retiredHistoryFindings += historyScan.retiredHistoryFindings
      }
      if (
        JSON.stringify(indexEntries(root)) !== JSON.stringify(index) ||
        JSON.stringify(historyObjects(root)) !== JSON.stringify(history)
      )
        throw new Error(
          'Git index or references changed during publication audit; retry on a stable candidate',
        )
    }
    const candidateScan = await scanWithGitleaks(
      root,
      stage,
      false,
      sourceMap,
      path.join(stage, 'candidate.json'),
      patterns,
    )
    findings.push(...candidateScan.findings)
    const uniqueFindings = new Map(findings.map((finding) => [JSON.stringify(finding), finding]))
      .values()
      .toArray()
    return {
      mode,
      status: uniqueFindings.length === 0 ? 'pass' : 'fail',
      stats,
      knownSecretScope:
        secrets.length === 0
          ? 'No configured private values available; pattern/path/archive checks still ran'
          : 'Project private environment files and process environment; values never recorded',
      findings: uniqueFindings,
    }
  } finally {
    await removeStage(parent, stage)
  }
}

async function removeStage(parent, stage) {
  const actual = await realpath(stage)
  if (!inside(await realpath(parent), actual))
    throw new Error(
      'Refusing to remove a publication staging directory outside its verified parent',
    )
  await rm(actual, { recursive: true, force: true })
}
