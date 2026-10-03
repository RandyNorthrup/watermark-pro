import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

// Original npm bytes and matching preferred source are verified in the offline seed.
const SDK = {
  version: '1.55.6',
  resolved: 'https://registry.npmjs.org/mediabunny/-/mediabunny-1.55.6.tgz',
  integrity:
    'sha512-IuwxlL8GQ5qODxvdj0mm5bUumrwTr13ooX0UygsrT2u1uwERjV1Awv/zuFoY5iNeYic6SQU78BcGcGLnDgPQ9g==',
  manifest: '98878c002de08d24d33261f656786af1d4ec011fc5dc11ffb027b0cb7e777bd7',
  entry: './dist/modules/src/index.js',
  gitHead: '6319bf2eee41c1143c3de02d35347cf31d6de53e',
  seed: 'docs/licenses/mediabunny-1.55.6-sdk-patch.json',
  seedHash: '29c063279f55b9d958dd658551724565e1fd9368140088e8640409c39c72f7f1',
  files: [
    'src/media-sink.ts',
    'dist/modules/src/media-sink.js',
    'shared/aac-misc.ts',
    'dist/modules/shared/aac-misc.js',
    'dist/modules/shared/aac-misc.d.ts',
    'dist/modules/shared/aac-misc.d.ts.map',
    'dist/modules/src/media-sink.d.ts.map',
  ],
}
function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}
async function hasStaleCache(directory) {
  let files
  try {
    files = await readdir(directory, { recursive: true })
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
  for (const file of files) {
    if (path.basename(file) !== 'mediabunny.js') continue
    const source = await readFile(path.join(directory, file), 'utf8')
    if (
      !/packet\.timestamp\s*-\s*Math\.min\(\s*0,\s*this\.expectedFirstTimestamp\s*\)/u.test(
        source,
      ) ||
      !source.includes('AAC decoded extent does not match registered frame spans.') ||
      !source.includes('AAC frame span provenance is unavailable.') ||
      !source.includes('aacSpans')
    )
      return true
  }
  return false
}
async function sourceBytes(directory, name) {
  let current = directory
  for (const segment of name.split('/')) {
    current = path.join(current, segment)
    try {
      const entry = await lstat(current)
      if (entry.isSymbolicLink()) throw new Error('Mediabunny patch refused: symbolic source path.')
    } catch (error) {
      if (error.code === 'ENOENT') return null
      throw error
    }
  }
  return readFile(current)
}

/** Apply one complete reviewed SDK state; unknown or mixed input states refuse every write. */
export async function patchMediabunny(root) {
  const directory = path.join(root, 'node_modules/mediabunny')
  const [manifestBytes, lockBytes, sdkBytes, seedBytes] = await Promise.all([
    readFile(path.join(root, 'package.json')),
    readFile(path.join(root, 'package-lock.json')),
    readFile(path.join(directory, 'package.json')),
    readFile(path.join(root, SDK.seed)),
  ])
  const manifest = JSON.parse(manifestBytes.toString('utf8'))
  const lock = JSON.parse(lockBytes.toString('utf8'))
  const pin = lock.packages?.['node_modules/mediabunny']
  if (
    manifest.dependencies?.mediabunny !== SDK.version ||
    lock.packages?.['']?.dependencies?.mediabunny !== SDK.version ||
    pin?.version !== SDK.version ||
    pin.resolved !== SDK.resolved ||
    pin.integrity !== SDK.integrity
  )
    throw new Error(
      'Mediabunny patch refused: package and lock provenance do not match the reviewed pin.',
    )
  const sdk = JSON.parse(sdkBytes.toString('utf8'))
  const entries = sdk.exports?.['.']
  if (
    sdk.version !== SDK.version ||
    entries?.browser?.import !== SDK.entry ||
    entries?.node?.import !== SDK.entry ||
    entries?.default !== SDK.entry
  )
    throw new Error('Mediabunny patch refused: browser, Worker and Node ESM entrypoints changed.')
  if (hash(sdkBytes) !== SDK.manifest)
    throw new Error(
      'Mediabunny patch refused: installed package manifest does not match reviewed source.',
    )
  if (hash(seedBytes) !== SDK.seedHash)
    throw new Error('Mediabunny patch refused: preferred source seed digest changed.')
  const seed = JSON.parse(seedBytes.toString('utf8'))
  if (
    seed.version !== SDK.version ||
    seed.gitHead !== SDK.gitHead ||
    seed.files.map((file) => file.name).join('\0') !== SDK.files.join('\0')
  )
    throw new Error('Mediabunny patch refused: preferred source provenance changed.')
  // Validate the complete source set and every replacement before the first write.
  const candidates = await Promise.all(
    seed.files.map(async (file) => {
      if (
        hash(Buffer.from(file.afterSource)) !== file.after ||
        (file.beforeSource === null
          ? file.before !== null
          : hash(Buffer.from(file.beforeSource)) !== file.before)
      )
        throw new Error('Mediabunny patch refused: preferred source payload is inconsistent.')
      const bytes = await sourceBytes(directory, file.name)
      return {
        file,
        bytes,
        digest: bytes === null ? null : hash(bytes),
        target: path.join(directory, file.name),
      }
    }),
  )
  const after = candidates.every(({ file, digest }) => digest === file.after)
  const pristine = candidates.every(({ file, digest }) => digest === file.before)
  const legacy = candidates.every(({ file, digest }) => digest === (file.legacy ?? file.before))
  if (!after && !pristine && !legacy)
    throw new Error('Mediabunny patch refused: unknown or mixed source state; no files modified.')
  let changed = 0
  if (!after) {
    for (const candidate of candidates) {
      await mkdir(path.dirname(candidate.target), { recursive: true })
      await writeFile(candidate.target, candidate.file.afterSource)
      changed += 1
    }
  }
  const cache = path.join(root, 'node_modules/.vite')
  if (changed > 0 || (await hasStaleCache(cache))) await rm(cache, { recursive: true, force: true })
  return changed
}
