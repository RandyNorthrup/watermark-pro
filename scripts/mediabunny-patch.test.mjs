import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { patchMediabunny } from './lib/mediabunny-patch.mjs'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const FILES = [
  {
    name: 'dist/modules/src/media-sink.js',
    after: 'bb7892eb4c70a4a7b9b1ec66a6658fa7ab03fabf4648622e174c7dac8ba542a5',
  },
  {
    name: 'src/media-sink.ts',
    after: '6f841afa6a1e24bf8baade2aa17edf1c49132b92fb79dcdda2b37789250260b4',
  },
]
async function fixture(context) {
  const directory = await mkdtemp(path.join(tmpdir(), 'lumafoil-sdk-patch-'))
  context.after(() => rm(directory, { recursive: true, force: true }))
  const manifest = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'))
  const lock = JSON.parse(await readFile(path.join(ROOT, 'package-lock.json'), 'utf8'))
  await writeFile(path.join(directory, 'package.json'), JSON.stringify(manifest))
  await writeFile(path.join(directory, 'package-lock.json'), JSON.stringify(lock))
  const sdk = path.join(directory, 'node_modules/mediabunny')
  await mkdir(sdk, { recursive: true })
  await writeFile(
    path.join(sdk, 'package.json'),
    await readFile(path.join(ROOT, 'node_modules/mediabunny/package.json')),
  )
  for (const file of FILES) {
    const source = await readFile(path.join(ROOT, 'node_modules/mediabunny', file.name), 'utf8')
    // Reconstruct the original installed artifact, not a simulated decoder implementation.
    const before = source.replace(
      /this\.decoder\.decode\(packet\.clone\(\{ timestamp:.*? \}\)\.toEncodedAudioChunk\(\)\);/u,
      'this.decoder.decode(packet.toEncodedAudioChunk());',
    )
    await mkdir(path.dirname(path.join(sdk, file.name)), { recursive: true })
    await writeFile(path.join(sdk, file.name), before)
  }
  return { directory, sdk, manifest, lock }
}
function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

test('patches the actual pinned ESM and corresponding source once, preserving published hashes', async (context) => {
  const { directory, sdk } = await fixture(context)
  const cache = path.join(directory, 'node_modules/.vite/mediabunny.js')
  await mkdir(path.dirname(cache), { recursive: true })
  await writeFile(cache, 'old optimized dependency')
  assert.equal(await patchMediabunny(directory), 2)
  await assert.rejects(readFile(cache), { code: 'ENOENT' })
  for (const file of FILES) {
    const bytes = await readFile(path.join(sdk, file.name))
    assert.equal(hash(bytes), file.after)
  }
  await writeFile(path.join(sdk, 'cache-control'), 'verified package')
  await mkdir(path.dirname(cache), { recursive: true })
  await writeFile(cache, 'stale optimized dependency')
  assert.equal(await patchMediabunny(directory), 0)
  await assert.rejects(readFile(cache), { code: 'ENOENT' })
  assert.equal(await readFile(path.join(sdk, 'cache-control'), 'utf8'), 'verified package')
  await mkdir(path.dirname(cache), { recursive: true })
  const verified = await readFile(path.join(sdk, FILES[0].name))
  await writeFile(cache, verified)
  assert.equal(await patchMediabunny(directory), 0)
  assert.deepEqual(await readFile(cache), verified)
})
test('recovers only a recognized partially applied patch', async (context) => {
  const { directory, sdk } = await fixture(context)
  await writeFile(
    path.join(sdk, FILES[0].name),
    await readFile(path.join(ROOT, 'node_modules/mediabunny', FILES[0].name)),
  )
  assert.equal(await patchMediabunny(directory), 1)
})
test('rejects a changed direct version pin', async (context) => {
  const { directory, manifest } = await fixture(context)
  manifest.dependencies.mediabunny = '^1.55.6'
  await writeFile(path.join(directory, 'package.json'), JSON.stringify(manifest))
  await assert.rejects(patchMediabunny(directory), /provenance/u)
})
for (const field of ['version', 'resolved', 'integrity']) {
  test(`rejects changed lock provenance: ${field}`, async (context) => {
    const { directory, lock } = await fixture(context)
    lock.packages['node_modules/mediabunny'][field] = 'unreviewed'
    await writeFile(path.join(directory, 'package-lock.json'), JSON.stringify(lock))
    await assert.rejects(patchMediabunny(directory), /provenance/u)
  })
}
test('rejects a changed lock root pin', async (context) => {
  const { directory, lock } = await fixture(context)
  lock.packages[''].dependencies.mediabunny = '1.55.7'
  await writeFile(path.join(directory, 'package-lock.json'), JSON.stringify(lock))
  await assert.rejects(patchMediabunny(directory), /provenance/u)
})
test('rejects an installed package version or entrypoint change', async (context) => {
  const { directory, sdk } = await fixture(context)
  const target = path.join(sdk, 'package.json')
  const manifest = JSON.parse(await readFile(target, 'utf8'))
  manifest.exports['.'].browser.import = './unreviewed.js'
  await writeFile(target, JSON.stringify(manifest))
  await assert.rejects(patchMediabunny(directory), /entrypoints/u)
})
test('rejects an otherwise altered installed manifest', async (context) => {
  const { directory, sdk } = await fixture(context)
  await writeFile(
    path.join(sdk, 'package.json'),
    `${await readFile(path.join(sdk, 'package.json'), 'utf8')}\n`,
  )
  await assert.rejects(patchMediabunny(directory), /manifest/u)
})
for (const file of FILES) {
  test(`rejects unknown ${file.name} bytes before modifying either file`, async (context) => {
    const { directory, sdk } = await fixture(context)
    const other = FILES.find((item) => item !== file)
    const before = await readFile(path.join(sdk, other.name))
    await writeFile(
      path.join(sdk, file.name),
      `${await readFile(path.join(sdk, file.name), 'utf8')}\n`,
    )
    await assert.rejects(patchMediabunny(directory), /unknown source digest/u)
    assert.deepEqual(await readFile(path.join(sdk, other.name)), before)
  })
}
