import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { patchMediabunny } from './lib/mediabunny-patch.mjs'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const SEED_PATH = 'docs/licenses/mediabunny-1.55.6-sdk-patch.json'
const seedBytes = await readFile(path.join(ROOT, SEED_PATH))
const SEED = JSON.parse(seedBytes.toString('utf8'))
const FROM = 'this.decoder.decode(packet.toEncodedAudioChunk());'
const TO =
  'this.decoder.decode(packet.clone({ timestamp: packet.timestamp - Math.min(0, this.expectedFirstTimestamp) }).toEncodedAudioChunk());'
function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}
async function writeSource(sdk, file, state) {
  const source = state === 'after' ? file.afterSource : file.beforeSource
  if (source === null) return
  const bytes = state === 'legacy' && file.legacy !== null ? source.replace(FROM, () => TO) : source
  let expected = file.before
  if (state === 'after') expected = file.after
  else if (state === 'legacy') expected = file.legacy ?? file.before
  assert.equal(hash(bytes), expected)
  const target = path.join(sdk, file.name)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, bytes)
}
async function fixture(context, state = 'pristine') {
  const directory = await mkdtemp(path.join(tmpdir(), 'lumafoil-sdk-patch-'))
  context.after(() => rm(directory, { recursive: true, force: true }))
  const manifest = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'))
  const lock = JSON.parse(await readFile(path.join(ROOT, 'package-lock.json'), 'utf8'))
  await writeFile(path.join(directory, 'package.json'), JSON.stringify(manifest))
  await writeFile(path.join(directory, 'package-lock.json'), JSON.stringify(lock))
  await mkdir(path.join(directory, path.dirname(SEED_PATH)), { recursive: true })
  await writeFile(path.join(directory, SEED_PATH), seedBytes)
  const sdk = path.join(directory, 'node_modules/mediabunny')
  await mkdir(sdk, { recursive: true })
  await writeFile(
    path.join(sdk, 'package.json'),
    await readFile(path.join(ROOT, 'node_modules/mediabunny/package.json')),
  )
  for (const file of SEED.files) await writeSource(sdk, file, state)
  return { directory, sdk, manifest, lock }
}
async function snapshot(sdk) {
  return Promise.all(
    SEED.files.map(async (file) => {
      try {
        return await readFile(path.join(sdk, file.name))
      } catch (error) {
        if (error.code === 'ENOENT') return null
        throw error
      }
    }),
  )
}
async function refusesUnchanged(directory, sdk, pattern) {
  const before = await snapshot(sdk)
  await assert.rejects(patchMediabunny(directory), pattern)
  assert.deepEqual(await snapshot(sdk), before)
}

for (const state of ['pristine', 'legacy']) {
  test(`patches only complete ${state} state to exact seven-artifact output`, async (context) => {
    const { directory, sdk } = await fixture(context, state)
    assert.equal(await patchMediabunny(directory), SEED.files.length)
    const bytes = await snapshot(sdk)
    for (const [index, file] of SEED.files.entries()) assert.equal(hash(bytes[index]), file.after)
    assert.equal(await patchMediabunny(directory), 0)
  })
}
test('invalidates stale optimized old clock graph but preserves verified warm span graph', async (context) => {
  const { directory, sdk } = await fixture(context, 'after')
  const cache = path.join(directory, 'node_modules/.vite/mediabunny.js')
  await mkdir(path.dirname(cache), { recursive: true })
  const wrapper = SEED.files.find((file) => file.name === 'dist/modules/src/media-sink.js')
  await writeFile(
    cache,
    wrapper.beforeSource.replace(FROM, () => TO),
  )
  assert.equal(await patchMediabunny(directory), 0)
  await assert.rejects(readFile(cache), { code: 'ENOENT' })
  await mkdir(path.dirname(cache), { recursive: true })
  const parser = SEED.files.find((file) => file.name === 'dist/modules/shared/aac-misc.js')
  const warm = wrapper.afterSource + parser.afterSource
  await writeFile(cache, warm)
  const before = await snapshot(sdk)
  assert.equal(await patchMediabunny(directory), 0)
  assert.equal(await readFile(cache, 'utf8'), warm)
  assert.deepEqual(await snapshot(sdk), before)
})
for (const file of SEED.files) {
  test(`rejects partial ${file.name} before every write`, async (context) => {
    const { directory, sdk } = await fixture(context)
    await writeSource(sdk, file, 'after')
    await refusesUnchanged(directory, sdk, /mixed source state/u)
  })
  test(`rejects unknown ${file.name} before every write`, async (context) => {
    const { directory, sdk } = await fixture(context)
    const target = path.join(sdk, file.name)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, `${file.beforeSource ?? ''}\n`)
    await refusesUnchanged(directory, sdk, /mixed source state/u)
  })
  test(`rejects missing ${file.name} in applied state before every write`, async (context) => {
    const { directory, sdk } = await fixture(context, 'after')
    await rm(path.join(sdk, file.name))
    await refusesUnchanged(directory, sdk, /mixed source state/u)
  })
}
test('rejects partial legacy clock correction', async (context) => {
  const { directory, sdk } = await fixture(context)
  await writeSource(sdk, SEED.files[0], 'legacy')
  await refusesUnchanged(directory, sdk, /mixed source state/u)
})
test('rejects changed preferred-source seed without modifying SDK files', async (context) => {
  const { directory, sdk } = await fixture(context)
  await writeFile(path.join(directory, SEED_PATH), Buffer.concat([seedBytes, Buffer.from('\n')]))
  await refusesUnchanged(directory, sdk, /seed digest/u)
})
test('rejects source symlinks without modifying SDK or outside file', async (context) => {
  const { directory, sdk } = await fixture(context)
  const file = SEED.files[0]
  const target = path.join(sdk, file.name)
  const outside = path.join(directory, 'outside-source')
  await writeFile(outside, file.beforeSource)
  await rm(target)
  await symlink(outside, target)
  await assert.rejects(patchMediabunny(directory), /symbolic source/u)
  assert.equal(await readFile(outside, 'utf8'), file.beforeSource)
})
test('rejects a changed direct version pin', async (context) => {
  const { directory, sdk, manifest } = await fixture(context)
  manifest.dependencies.mediabunny = '^1.55.6'
  await writeFile(path.join(directory, 'package.json'), JSON.stringify(manifest))
  await refusesUnchanged(directory, sdk, /provenance/u)
})
for (const field of ['version', 'resolved', 'integrity']) {
  test(`rejects changed lock provenance: ${field}`, async (context) => {
    const { directory, sdk, lock } = await fixture(context)
    lock.packages['node_modules/mediabunny'][field] = 'unreviewed'
    await writeFile(path.join(directory, 'package-lock.json'), JSON.stringify(lock))
    await refusesUnchanged(directory, sdk, /provenance/u)
  })
}
test('rejects changed lock root pin', async (context) => {
  const { directory, sdk, lock } = await fixture(context)
  lock.packages[''].dependencies.mediabunny = '1.55.7'
  await writeFile(path.join(directory, 'package-lock.json'), JSON.stringify(lock))
  await refusesUnchanged(directory, sdk, /provenance/u)
})
test('rejects changed ESM entrypoint', async (context) => {
  const { directory, sdk } = await fixture(context)
  const target = path.join(sdk, 'package.json')
  const manifest = JSON.parse(await readFile(target, 'utf8'))
  manifest.exports['.'].browser.import = './unreviewed.js'
  await writeFile(target, JSON.stringify(manifest))
  await refusesUnchanged(directory, sdk, /entrypoints/u)
})
test('rejects otherwise altered installed manifest', async (context) => {
  const { directory, sdk } = await fixture(context)
  const target = path.join(sdk, 'package.json')
  await writeFile(target, `${await readFile(target, 'utf8')}\n`)
  await refusesUnchanged(directory, sdk, /manifest/u)
})
