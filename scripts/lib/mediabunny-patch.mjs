import { createHash } from 'node:crypto'
import { readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

// Verified against the original npm tarball, whose integrity is pinned in package-lock.json.
const SDK = {
  version: '1.55.6',
  resolved: 'https://registry.npmjs.org/mediabunny/-/mediabunny-1.55.6.tgz',
  integrity:
    'sha512-IuwxlL8GQ5qODxvdj0mm5bUumrwTr13ooX0UygsrT2u1uwERjV1Awv/zuFoY5iNeYic6SQU78BcGcGLnDgPQ9g==',
  manifest: '98878c002de08d24d33261f656786af1d4ec011fc5dc11ffb027b0cb7e777bd7',
  entry: './dist/modules/src/index.js',
  from: 'this.decoder.decode(packet.toEncodedAudioChunk());',
  // Preserve expectedFirstTimestamp for the SDK's existing presentation restoration.
  // GStreamer selects reverse playback for negative native decode timestamps.
  to: 'this.decoder.decode(packet.clone({ timestamp: packet.timestamp - Math.min(0, this.expectedFirstTimestamp) }).toEncodedAudioChunk());',
  files: [
    {
      name: 'dist/modules/src/media-sink.js',
      before: 'baa7893468c9cb6ca3158dfeda66b6d920941743602c1e2b952f40a2ed8567b1',
      after: 'bb7892eb4c70a4a7b9b1ec66a6658fa7ab03fabf4648622e174c7dac8ba542a5',
    },
    {
      name: 'src/media-sink.ts',
      before: 'dbc9db3cebfcface758393fad0db575be6d20bb853c796e6fc526375d288b958',
      after: '6f841afa6a1e24bf8baade2aa17edf1c49132b92fb79dcdda2b37789250260b4',
    },
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
      /this\.decoder\.decode\(\s*packet\.toEncodedAudioChunk\(\s*\)\s*\)/u.test(source) ||
      !/packet\.timestamp\s*-\s*Math\.min\(\s*0,\s*this\.expectedFirstTimestamp\s*\)/u.test(source)
    )
      return true
  }
  return false
}

/** Apply only the reviewed native decode-clock change; unknown pins, entries or source bytes refuse installation. */
export async function patchMediabunny(root) {
  const directory = path.join(root, 'node_modules/mediabunny')
  const [manifestBytes, lockBytes, sdkBytes] = await Promise.all([
    readFile(path.join(root, 'package.json')),
    readFile(path.join(root, 'package-lock.json')),
    readFile(path.join(directory, 'package.json')),
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
  // Validate every file before writing any of them; a refused source stays untouched.
  const candidates = await Promise.all(
    SDK.files.map(async (file) => {
      const target = path.join(directory, file.name)
      const bytes = await readFile(target)
      const digest = hash(bytes)
      if (digest === file.after) return { target, bytes, isChanged: false }
      if (digest !== file.before)
        throw new Error(`Mediabunny patch refused: unknown source digest for ${file.name}.`)
      const patched = Buffer.from(bytes.toString('utf8').replace(SDK.from, () => SDK.to))
      if (hash(patched) !== file.after)
        throw new Error(
          `Mediabunny patch refused: corrected source digest differs for ${file.name}.`,
        )
      return { target, bytes: patched, isChanged: true }
    }),
  )
  let changed = 0
  for (const candidate of candidates) {
    if (!candidate.isChanged) continue
    await writeFile(candidate.target, candidate.bytes)
    changed += 1
  }
  // Vite keys optimized dependencies by package version, which this reviewed patch preserves.
  const cache = path.join(root, 'node_modules/.vite')
  if (changed > 0 || (await hasStaleCache(cache))) await rm(cache, { recursive: true, force: true })
  return changed
}
