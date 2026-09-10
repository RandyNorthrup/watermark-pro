/** Publication checks are bounded and independent of scanner allowlists. No private value enters a finding. */
import { crc32 } from 'node:zlib'

import { Unzip, UnzipInflate } from 'fflate'

const MIB = 1024 * 1024
export const PUBLICATION_LIMITS = {
  candidateBytes: 512 * MIB,
  fileBytes: 128 * MIB,
  zipBytes: 32 * MIB,
  expandedBytes: 128 * MIB,
  entryBytes: 64 * MIB,
  entries: 2000,
  depth: 3,
  ratio: 200,
  inflateChunk: 4096,
}
const PRIVATE_PARTS = new Set([
  '.git',
  '.wrangler',
  '.claude',
  '.codex',
  '.ssh',
  '.aws',
  '.azure',
  '.secrets',
  'node_modules',
  '__macosx',
  '__pycache__',
])
const PRIVATE_ROOTS = new Set([
  'temp',
  'tmp',
  'dist',
  'coverage',
  'test-results',
  'playwright-report',
  '.vitest-attachments',
])
const EXAMPLES = new Set(['.env.example', '.dev.vars.example'])
const EOCD = {
  signature: 0x06_05_4b_50,
  bytes: 22,
  maxComment: 65_535,
  disk: 4,
  centralDisk: 6,
  diskEntries: 8,
  entries: 10,
  size: 12,
  offset: 16,
  comment: 20,
}
const CENTRAL = {
  signature: 0x02_01_4b_50,
  bytes: 46,
  flags: 8,
  method: 10,
  crc: 16,
  compressed: 20,
  size: 24,
  name: 28,
  extra: 30,
  comment: 32,
  disk: 34,
  attributes: 38,
  local: 42,
}
const LOCAL = { signature: 0x04_03_4b_50, bytes: 30, name: 26, extra: 28 }
const ASCII_CONTROL_END = 32
const ASCII_DELETE = 127
const SECRET_COMPARISON_MIN_LENGTH = 16
const LOCAL_FLAGS_OFFSET = 6
const LOCAL_METHOD_OFFSET = 8
const ZIP_UTF8 = 0x8_00
const ZIP_ENCRYPTED = 1
const UNIX_KIND_MASK = 0xf0_00
const UNIX_REGULAR = 0x80_00
const UNIX_DIRECTORY = 0x40_00
const UNSUPPORTED_ARCHIVE = /\.(?:7z|rar|tar|tgz|gz|bz2|xz|br)$/i
const UNSUPPORTED_MAGIC = [
  '1f8b',
  '377abcaf271c',
  '526172211a07',
  '425a68',
  'fd377a585a00',
  '28b52ffd',
].map((hex) => Buffer.from(hex, 'hex'))

/** Reject archive aliases and private paths before writing anything to a scan staging directory. */
export function safePublicationPath(value) {
  const normalized = value.replaceAll('\\', '/')
  if (
    normalized.startsWith('/') ||
    normalized.includes(':') ||
    [...normalized].some(
      (character) =>
        character.codePointAt(0) < ASCII_CONTROL_END || character.codePointAt(0) === ASCII_DELETE,
    )
  )
    throw new Error('Non-portable or absolute publication path')
  const parts = normalized.replace(/\/$/, '').split('/')
  if (
    parts.some(
      (part) =>
        part === '' ||
        part === '.' ||
        part === '..' ||
        /[ .]$/.test(part) ||
        /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
    )
  ) {
    throw new Error('Unsafe publication path component')
  }
  return parts.join('/')
}

export function forbiddenPublicationPath(value) {
  const normalized = safePublicationPath(value).toLowerCase()
  const parts = normalized.split('/')
  const name = parts.at(-1)
  if (PRIVATE_ROOTS.has(parts[0]) || parts.some((part) => PRIVATE_PARTS.has(part)))
    return 'Private or generated directory'
  if (
    !EXAMPLES.has(name) &&
    (name === '.env' ||
      name === '.dev.vars' ||
      name.startsWith('.env.') ||
      name.startsWith('.dev.vars.'))
  )
    return 'Private environment configuration'
  if (
    /\.(?:pem|key|p12|pfx|sqlite|sqlite3|db|kdbx|pyc|pyo)$/i.test(name) ||
    /^(?:id_rsa|id_ed25519|credentials(?:\.|$)|creds(?:\.|$)|client_secret.*\.json$|service-account.*\.json$)/i.test(
      name,
    )
  )
    return 'Credential, key, or private database file'
  if (
    ['settings.local.json', '.ds_store', 'thumbs.db', '.netrc', '.git-credentials'].includes(name)
  )
    return 'Private machine configuration or metadata'
  return null
}

export function configuredSecretPatterns(secrets) {
  return secrets.flatMap(({ name, value }) => {
    if (value.length < SECRET_COMPARISON_MIN_LENGTH)
      throw new Error(`Configured ${name} is too short for reliable private-value comparison`)
    const utf8 = Buffer.from(value)
    const variants = new Set([
      value,
      JSON.stringify(value).slice(1, -1),
      encodeURIComponent(value),
      utf8.toString('base64'),
      utf8.toString('hex'),
    ])
    return [
      ...[...variants].map((variant) => ({ name, bytes: Buffer.from(variant) })),
      { name, bytes: Buffer.from(value, 'utf16le') },
    ]
  })
}

export function findConfiguredSecrets(bytes, patterns) {
  return [
    ...new Set(
      patterns.filter((pattern) => bytes.includes(pattern.bytes)).map((pattern) => pattern.name),
    ),
  ]
}

export function isZip(bytes, name) {
  const signature = bytes.length >= 4 ? bytes.readUInt32LE(0) : 0
  const hasZipHeader = signature === LOCAL.signature || signature === EOCD.signature
  if (!hasZipHeader && /\.zip$/i.test(name))
    throw new Error('A ZIP file has no supported ZIP header')
  if (
    UNSUPPORTED_ARCHIVE.test(name) ||
    UNSUPPORTED_MAGIC.some((magic) => bytes.subarray(0, magic.length).equals(magic)) ||
    bytes.subarray(257, 262).toString() === 'ustar'
  )
    throw new Error('Unsupported archive format; inspect or unpack it before publication')
  return hasZipHeader
}

function centralDirectory(bytes, limits) {
  if (bytes.length > limits.zipBytes) throw new Error('ZIP compressed-byte limit exceeded')
  let end = -1
  for (
    let offset = bytes.length - EOCD.bytes;
    offset >= Math.max(0, bytes.length - EOCD.bytes - EOCD.maxComment);
    offset -= 1
  ) {
    if (
      bytes.readUInt32LE(offset) === EOCD.signature &&
      offset + EOCD.bytes + bytes.readUInt16LE(offset + EOCD.comment) === bytes.length
    ) {
      end = offset
      break
    }
  }
  if (end < 0) throw new Error('ZIP end record is missing or has uninspected trailing data')
  const count = bytes.readUInt16LE(end + EOCD.entries)
  const start = bytes.readUInt32LE(end + EOCD.offset)
  const size = bytes.readUInt32LE(end + EOCD.size)
  if (
    count > limits.entries ||
    bytes.readUInt16LE(end + EOCD.diskEntries) !== count ||
    bytes.readUInt16LE(end + EOCD.disk) !== 0 ||
    bytes.readUInt16LE(end + EOCD.centralDisk) !== 0 ||
    start + size !== end
  )
    throw new Error('Unsupported, split, ZIP64, or over-limit ZIP directory')
  const entries = new Map()
  const metadata = []
  const compressedRanges = []
  const names = new Set()
  const ranges = []
  let offset = start
  let expanded = 0
  for (let index = 0; index < count; index += 1) {
    if (offset + CENTRAL.bytes > end || bytes.readUInt32LE(offset) !== CENTRAL.signature)
      throw new Error('Invalid ZIP central record')
    const flags = bytes.readUInt16LE(offset + CENTRAL.flags)
    const method = bytes.readUInt16LE(offset + CENTRAL.method)
    const compressed = bytes.readUInt32LE(offset + CENTRAL.compressed)
    const original = bytes.readUInt32LE(offset + CENTRAL.size)
    const nameLength = bytes.readUInt16LE(offset + CENTRAL.name)
    const next =
      offset +
      CENTRAL.bytes +
      nameLength +
      bytes.readUInt16LE(offset + CENTRAL.extra) +
      bytes.readUInt16LE(offset + CENTRAL.comment)
    if (
      next > end ||
      (flags & ZIP_ENCRYPTED) !== 0 ||
      ![0, 8].includes(method) ||
      bytes.readUInt16LE(offset + CENTRAL.disk) !== 0
    )
      throw new Error('Encrypted or unsupported ZIP member')
    const rawName = bytes
      .subarray(offset + CENTRAL.bytes, offset + CENTRAL.bytes + nameLength)
      .toString((flags & ZIP_UTF8) === 0 ? 'latin1' : 'utf8')
    const name = safePublicationPath(rawName)
    const canonical = name.normalize('NFC').toLowerCase()
    if (names.has(canonical)) throw new Error('Duplicate or aliased ZIP member')
    names.add(canonical)
    const kind = (bytes.readUInt32LE(offset + CENTRAL.attributes) >>> 16) & UNIX_KIND_MASK
    if (![0, UNIX_REGULAR, UNIX_DIRECTORY].includes(kind))
      throw new Error('ZIP links or special files are forbidden')
    expanded += original
    if (
      original > limits.entryBytes ||
      expanded > limits.expandedBytes ||
      original > Math.max(compressed, 1) * limits.ratio
    )
      throw new Error('ZIP expansion limit exceeded')
    const local = bytes.readUInt32LE(offset + CENTRAL.local)
    if (local + LOCAL.bytes > start || bytes.readUInt32LE(local) !== LOCAL.signature)
      throw new Error('ZIP member has an invalid local header')
    const dataStart =
      local +
      LOCAL.bytes +
      bytes.readUInt16LE(local + LOCAL.name) +
      bytes.readUInt16LE(local + LOCAL.extra)
    if (dataStart + compressed > start) throw new Error('ZIP member exceeds its data region')
    const localName = bytes.subarray(
      local + LOCAL.bytes,
      local + LOCAL.bytes + bytes.readUInt16LE(local + LOCAL.name),
    )
    const centralName = bytes.subarray(offset + CENTRAL.bytes, offset + CENTRAL.bytes + nameLength)
    if (
      !localName.equals(centralName) ||
      bytes.readUInt16LE(local + LOCAL_FLAGS_OFFSET) !== flags ||
      bytes.readUInt16LE(local + LOCAL_METHOD_OFFSET) !== method
    )
      throw new Error('ZIP local identity does not match its checked directory')
    if (original !== 0 && rawName.endsWith('/'))
      throw new Error('ZIP directory contains hidden file data')
    compressedRanges.push([dataStart, dataStart + compressed])
    ranges.push([local, dataStart + compressed])
    entries.set(rawName, {
      name,
      size: original,
      compressed,
      method,
      crc: bytes.readUInt32LE(offset + CENTRAL.crc),
      directory: rawName.endsWith('/'),
    })
    offset = next
  }
  if (offset !== end) throw new Error('ZIP central directory contains uninspected data')
  ranges.sort((first, second) => first[0] - second[0])
  for (let index = 1; index < ranges.length; index += 1) {
    if (ranges[index][0] < ranges[index - 1][1]) throw new Error('Overlapping ZIP members')
  }
  // Inspect every byte outside the validated compressed streams, including
  // local/central extra fields, descriptors, padding, filenames and comments.
  compressedRanges.sort((first, second) => first[0] - second[0])
  let metadataOffset = 0
  for (const [dataStart, dataEnd] of compressedRanges) {
    metadata.push(bytes.subarray(metadataOffset, dataStart))
    metadataOffset = dataEnd
  }
  metadata.push(bytes.subarray(metadataOffset))
  return { entries, metadata: Buffer.concat(metadata.flatMap((item) => [item, Buffer.from('\n')])) }
}

/** Stream inflation checks actual output size and CRC; declared ZIP sizes cannot hide a bomb or truncation. */
export function inspectZip(bytes, limits = PUBLICATION_LIMITS) {
  const directory = centralDirectory(bytes, limits)
  const metadata = directory.entries
  const completed = new Set()
  const discovered = new Set()
  const result = []
  let total = 0
  const unzip = new Unzip((file) => {
    const entry = metadata.get(file.name)
    if (entry === undefined || discovered.has(file.name) || file.compression !== entry.method)
      throw new Error('ZIP local members do not match the checked directory')
    if (
      (file.size !== undefined && file.size !== entry.compressed) ||
      (file.originalSize !== undefined && file.originalSize !== entry.size)
    )
      throw new Error('ZIP local sizes do not match the checked directory')
    discovered.add(file.name)
    const chunks = []
    let length = 0
    let checksum = 0
    file.ondata = (error, data, final) => {
      if (error !== null) throw error
      length += data.length
      total += data.length
      if (length > entry.size || length > limits.entryBytes || total > limits.expandedBytes)
        throw new Error('Actual ZIP expansion exceeds its checked bounds')
      checksum = crc32(data, checksum)
      chunks.push(Buffer.from(data))
      if (final) {
        if (length !== entry.size || checksum !== entry.crc)
          throw new Error('ZIP size or CRC does not match the extracted bytes')
        completed.add(file.name)
        if (!entry.directory)
          result.push({ path: entry.name, bytes: Buffer.concat(chunks, length) })
      }
    }
    file.start()
  })
  unzip.register(UnzipInflate)
  for (let offset = 0; offset < bytes.length; offset += limits.inflateChunk)
    unzip.push(
      bytes.subarray(offset, offset + limits.inflateChunk),
      offset + limits.inflateChunk >= bytes.length,
    )
  if (completed.size !== metadata.size)
    throw new Error('ZIP contains members that were not fully inspected')
  return { entries: result, metadata: directory.metadata }
}
